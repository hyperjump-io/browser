import { canRefer, referrerFor, refusedReferenceResponse } from "../file-references.js";
import { relativeFileUrl } from "../file-urls.js";
import { codedError } from "../json/coded-error.js";
import { jsonPointerGet } from "../json/jsonast-util.js";
import { missingValueError, startOf } from "./start.js";
import { acceptHeader, defaultMediaTypes, mediaTypeForContentType, mediaTypeForExtension } from "../media-types/media-types.js";
import { PriorityGroup, PrioritySignal } from "../priority.js";
import { responseMeta, withUrl } from "../response-meta.js";

/**
 * @import * as API from "./documents.d.ts"
 * @import { FetchRecord } from "../fetch-record.d.ts"
 * @import { HyperjumpFetchInit } from "../hyperjump.d.ts"
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { DocumentNode, MediaTypePlugin } from "../media-types/media-types.d.ts"
 */

/**
 * A document a session has: the document, its response's record, which is
 * the initiator of the requests its references cause, and the documents it
 * contains, and itself, by URL. A document found in another has its
 * container's record and set. `container` is the document that was retrieved: the document
 * itself, or the one it was found in.
 *
 * @typedef {{
 *   document: DocumentNode,
 *   record: FetchRecord | undefined,
 *   embedded: ReadonlyMap<string, DocumentNode>,
 *   container: DocumentNode
 * }} Entry
 */

/**
 * A document that's being retrieved, or was. While it's retrieved, its
 * request has the most urgent priority of whoever is waiting for it.
 *
 * @typedef {{ loading: Promise<Entry>, priority: PriorityGroup }} Kept
 */

/**
 * What a session keeps for documents: the entries by URL, as promises, so a
 * document that's asked for again while it's fetched or parsed is the same
 * one, and what its media types work out to.
 *
 * `retrieved` is the entry of each document that was retrieved, by the
 * document, which is how a target's document is known to the session.
 *
 * @typedef {{
 *   mediaTypes: readonly MediaTypePlugin[],
 *   accept: string,
 *   entries: Map<string, Kept>,
 *   retrieved: WeakMap<DocumentNode, Entry>
 * }} Documents
 */

/**
 * What caused a request: the record or response of the request that did,
 * or the URL of a document that has no record
 *
 * @typedef {Pick<HyperjumpFetchInit, "initiator" | "referrer">} Cause
 */

/** The key of a session's documents in its state */
const documentsKey = {};

/** @type typeof API.browse */
export const browse = async (session, url, given) => {
  /** @type API.BrowseOptions */
  const options = given ?? {};
  const { documentUrl, fragment } = parseUrl(session, url);
  const priority = prioritySignal(options.priority);
  const entry = await entryFor(session, documentUrl, options, priority);
  // The session's type says what its documents and nodes are
  return /** @type never */ (await targetIn(session, entry, documentUrl, fragment, priority, options.reference !== "manual"));
};

/**
 * What a fragment identifies in a document, as a target. To `follow`, a
 * reference is followed, and so is any that leads to, until there's a
 * value.
 *
 * @type (session: API.DocumentSession, entry: Entry, documentUrl: string, fragment: string, priority: PrioritySignal, follow: boolean) => Promise<API.Target<DocumentNode, JrefNode>>
 */
const targetIn = async (session, entry, documentUrl, fragment, priority, follow) => {
  /** @type string[] */
  const chain = [];

  for (;;) {
    const href = `${documentUrl}#${fragment}`;
    if (chain.includes(href)) {
      throw codedError(`Following references led back to '${relativeFileUrl(href)}'`, { code: "ERR_REFERENCE_CYCLE", chain: [...chain, href] }, href);
    }
    chain.push(href);

    const node = jsonPointerGet(fragmentPointer(entry.document, fragment), /** @type JrefNode */ (entry.document.children[0]));
    // Only a document the session didn't retrieve can have a parse that
    // failed, and so a value that's missing
    if (node === undefined) {
      throw missingValueError(href);
    }
    if (!follow || node.type !== "reference") {
      return { document: entry.container, node };
    }

    ({ documentUrl, fragment } = parseUrl(session, node.href));
    entry = await referenced(session, documentUrl, entry, priority);
  }
};

/**
 * The JSON Pointer to the node a fragment identifies in a document, which
 * the document says with its `anchors`. Without them it has no fragments,
 * so any fragment identifies the whole document. With them, a fragment is
 * an anchor, or else a JSON Pointer that's percent-encoded.
 *
 * @type (document: DocumentNode, fragment: string) => string
 */
const fragmentPointer = (document, fragment) => {
  const { anchors } = document;
  if (!anchors) {
    return "";
  }

  if (Object.hasOwn(anchors, fragment)) {
    return anchors[fragment];
  }

  const pointer = decodeURIComponent(fragment);
  if (pointer !== "" && !pointer.startsWith("/")) {
    throw codedError(`There's no '${fragment}' anchor in '${relativeFileUrl(document.url)}'`, { code: "ERR_ANCHOR_NOT_FOUND", anchor: fragment }, document.url);
  }

  return pointer;
};

/**
 * The entry for the document at a URL that `browse` is asked
 * for. With `referencedFrom`, it's the document a reference in that
 * target's document, or in that document, leads to.
 *
 * @type (session: API.DocumentSession, url: string, options: API.BrowseOptions, priority: PrioritySignal) => Promise<Entry>
 */
const entryFor = (session, url, options, priority) => {
  const { referencedFrom } = options;
  return referencedFrom
    ? referenced(session, url, entryOf(session, referencedFrom), priority)
    : load(session, url, { initiator: options.initiator }, priority);
};

/**
 * The entry of the document a reference is followed from: a target's, or
 * the document itself. Nothing caused a document the session didn't
 * retrieve, like a tree from a unified pipeline, so it has no record, and
 * its requests are judged by its URL.
 *
 * @type (session: API.DocumentSession, from: API.Target | DocumentNode) => Entry
 */
const entryOf = (session, from) => {
  const document = /** @type DocumentNode */ (startOf(from).document);
  return documentsOf(session).retrieved.get(document)
    ?? { document, record: undefined, embedded: embeddedIn(document), container: document };
};

/**
 * The entry for the document a reference in `from`'s document leads to. A
 * document that `from`'s contains, or that's contained with it, is found
 * before anything the session has or fetches.
 *
 * @type (session: API.DocumentSession, url: string, from: Entry, priority: PrioritySignal) => Promise<Entry>
 */
const referenced = async (session, url, from, priority) => {
  const document = from.embedded.get(url);
  return document ? { ...from, document } : load(session, url, causeOf(from), priority);
};

/**
 * What a reference in an entry's document causes a request to have: the
 * record of the document that was retrieved, or, for a document the session
 * didn't retrieve, its URL, so the request is judged by where the document
 * is, like one that was retrieved.
 *
 * @type (entry: Entry) => Cause
 */
const causeOf = (entry) => entry.record ? { initiator: entry.record } : { referrer: entry.container.url };

/** @type (priority: API.BrowseOptions["priority"]) => PrioritySignal */
const prioritySignal = (priority) => priority instanceof PrioritySignal ? priority : PrioritySignal.of(priority ?? "auto");

/**
 * A URL as a document's URL and a fragment, which stays percent-encoded
 *
 * @type (session: API.DocumentSession, url: string | URL) => { documentUrl: string, fragment: string }
 */
const parseUrl = (session, url) => {
  const parsed = new URL(url, session.contextUrl);
  const fragment = parsed.hash.slice(1);
  parsed.hash = "";
  return { documentUrl: parsed.href, fragment };
};

/** @type (session: API.DocumentSession) => Documents */
const documentsOf = (session) => session.state(documentsKey, () => {
  const mediaTypes = session.config.mediaTypes ?? defaultMediaTypes;
  return { mediaTypes, accept: acceptHeader(mediaTypes), entries: new Map(), retrieved: new WeakMap() };
});

/**
 * The session's entry for a URL, retrieved if it doesn't have one. A
 * document is also kept under the URL its response came from, like where a
 * redirect led, so there's one document for a URL however it was reached.
 * It's never kept under the URL the document says it has, which a document
 * could use to answer for another one. One that fails isn't kept, so it can
 * be asked for again.
 *
 * Whoever waits for a document adds its priority to the document's until
 * its wait is over, so a document that's being preloaded at a low priority
 * is fetched at a higher one once something needs it.
 *
 * A document is only given to a cause that could have retrieved it: only a
 * `file:` document can refer to a `file:` URL, and that's the URL that's
 * asked for and the URL the document's response came from. A URL the cause
 * can't refer to is fetched anyway, so the session refuses it and records
 * that, but it isn't kept, so whoever else asks for it doesn't get the
 * refusal. `allowRetrieval` is the session's, so a document the session
 * has passed it already.
 *
 * @type (session: API.DocumentSession, url: string, cause: Cause, priority: PrioritySignal) => Promise<Entry>
 */
const load = (session, url, cause, priority) => {
  const referrer = referrerFor(cause.initiator, cause.referrer);
  if (!canRefer(url, referrer)) {
    return retrieve(session, url, cause, priority).then(({ entry }) => entry);
  }

  const { entries } = documentsOf(session);
  const existing = entries.get(url);
  if (existing) {
    return existing.loading
      .then((entry) => referable(entry, url, referrer))
      .finally(existing.priority.add(priority));
  }

  const group = new PriorityGroup();
  const leave = group.add(priority);
  /** @type Kept */
  const kept = {
    priority: group,
    loading: retrieve(session, url, cause, group.signal).then(({ entry, responseUrl }) => {
      const reached = entries.get(responseUrl);
      if (reached && reached !== kept) {
        return reached.loading;
      }
      entries.set(responseUrl, kept);
      return entry;
    })
  };
  entries.set(url, kept);
  kept.loading.catch(() => {
    if (entries.get(url) === kept) {
      entries.delete(url);
    }
  });
  return kept.loading.finally(leave);
};

/**
 * An entry the session has, for a cause that can refer to the URL it was
 * asked for, if the cause can refer to where its response came from too,
 * like where a redirect led
 *
 * @type (entry: Entry, url: string, referrer: string | undefined) => Entry
 */
const referable = (entry, url, referrer) => {
  const responseUrl = entry.container.url;
  if (!canRefer(responseUrl, referrer)) {
    throw refusedReferenceResponse(url, responseUrl, /** @type string */ (referrer));
  }
  return entry;
};

/**
 * A document's entry, and the URL its response came from
 *
 * @type (session: API.DocumentSession, url: string, cause: Cause, priority: PrioritySignal) => Promise<{ entry: Entry, responseUrl: string }>
 */
const retrieve = async (session, url, cause, priority) => {
  const { mediaTypes, accept, retrieved } = documentsOf(session);
  const response = await session.fetch(url, { ...cause, headers: { accept }, priority });

  try {
    // A response a redirect led to has the request's fragment
    const responseUrl = new URL(response.url);
    responseUrl.hash = "";

    if (!response.ok) {
      throw codedError(`'${relativeFileUrl(responseUrl.href)}' can't be used, because its response's status is ${response.status}`, { code: "ERR_HTTP_STATUS", status: response.status }, responseUrl.href);
    }

    // A file doesn't have a media type, so its extension is all there is
    const isFile = responseUrl.protocol === "file:";
    const mediaType = isFile
      ? mediaTypeForExtension(mediaTypes, responseUrl.href)
      : mediaTypeForContentType(mediaTypes, response.headers.get("content-type"));
    if (!mediaType) {
      const reason = isFile
        ? "no media type has its extension"
        : `no media type parses its 'Content-Type', which is ${response.headers.has("content-type") ? `'${response.headers.get("content-type")}'` : "missing"}`;
      throw codedError(`'${relativeFileUrl(responseUrl.href)}' can't be used, because ${reason}. Use 'mediaTypes' to add support for a media type.`, { code: "ERR_UNSUPPORTED_MEDIA_TYPE" }, responseUrl.href);
    }

    // A response whose URL is the document's already is given as it is. A
    // layer can have given it one that can't be defined again.
    const parsed = response.url === responseUrl.href ? response : withUrl(response, responseUrl.href);
    const document = await mediaType.parse(parsed, session);
    /** @type Entry */
    const entry = { document, record: responseMeta(response).record, embedded: embeddedIn(document), container: document };
    retrieved.set(document, entry);
    return { entry, responseUrl: responseUrl.href };
  } catch (error) {
    // A body that wasn't read holds its file or connection
    if (!response.bodyUsed) {
      await response.body?.cancel().catch(() => {});
    }
    throw error;
  }
};

/**
 * The documents a document's references look in before the session's: the
 * ones it contains, and the document itself, by their URLs as they're
 * compared: parsed, without fragments. A reference to the document's own
 * URL finds the document, so a tree the session didn't retrieve can refer
 * to itself. A document it says it contains at its own URL comes first.
 *
 * A document that isn't a file can only have a `file:` URL in it that's
 * absolute, which says where files are on a machine, so it can't be used.
 * In a file, one could have been relative, which can't be told from here.
 *
 * @type (document: DocumentNode) => Map<string, DocumentNode>
 * @throws {TypeError} If a URL isn't one.
 */
const embeddedIn = (document) => {
  const embedded = new Map();
  for (const [url, contained] of Object.entries(document.embedded ?? {})) {
    const parsed = new URL(url);
    if (parsed.protocol === "file:" && !document.url.startsWith("file:")) {
      throw codedError(`'${document.url}' can't be used, because it says it contains a document with an absolute file: URL`, { code: "ERR_ABSOLUTE_FILE_URL" }, document.url);
    }
    parsed.hash = "";
    embedded.set(parsed.href, contained);
  }

  const own = new URL(document.url);
  own.hash = "";
  if (!embedded.has(own.href)) {
    embedded.set(own.href, document);
  }
  return embedded;
};
