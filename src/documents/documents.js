import { canRefer, referrerFor, refusedReferenceResponse } from "../file-references.js";
import { relativeFileUrl } from "../file-urls.js";
import { codedError } from "../json/coded-error.js";
import { jsonPointerGet } from "../json/jsonast-util.js";
import { isJsonPointer } from "../json/json-pointer-syntax.js";
import { limit } from "./limit.js";
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
 * `maxReferences` is the session's, or the default.
 *
 * `redirected` is the fragment a redirect led to, by the URL that was asked
 * for. A document is fetched once, so it's kept for whoever asks for the URL
 * after.
 *
 * @typedef {{
 *   mediaTypes: readonly MediaTypePlugin[],
 *   accept: string,
 *   maxReferences: number,
 *   entries: Map<string, Kept>,
 *   retrieved: WeakMap<DocumentNode, Entry>,
 *   redirected: Map<string, string>
 * }} Documents
 */

/**
 * The entry for a URL, with the fragment a redirect led to, if it led to
 * one, which identifies the value instead of the URL's own, as the Fetch
 * standard has a `Location`'s fragment win
 *
 * @typedef {{ entry: Entry, fragment: string | undefined }} Reached
 */

/**
 * How many references `browse` follows in a row to reach a value, unless
 * the session says, like `maxRedirects`. A real schema has one or two.
 */
const MAX_REFERENCES = 20;

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
  // A relative URL is relative to the document it's referenced from
  const base = options.referencedFrom ? /** @type DocumentNode */ (startOf(options.referencedFrom).document).url : session.contextUrl;
  const { documentUrl, fragment } = parseUrl(url, base);
  const priority = prioritySignal(options.priority);
  const reached = await entryFor(session, documentUrl, options, priority);
  // The session's type says what its documents and nodes are
  return /** @type never */ (await targetIn(session, reached, documentUrl, fragment, priority, options.reference !== "manual"));
};

/**
 * What a fragment identifies in a document, as a target. To `follow`, a
 * reference is followed, and so is any that leads to, until there's a
 * value. Each one can lead to a new document, so following more than
 * `maxReferences` is an error, before the next one is retrieved. Where a
 * redirect led to a fragment, it's that fragment's value.
 *
 * @type (session: API.DocumentSession, reached: Reached, documentUrl: string, fragment: string, priority: PrioritySignal, follow: boolean) => Promise<API.Target<DocumentNode, JrefNode>>
 */
const targetIn = async (session, reached, documentUrl, fragment, priority, follow) => {
  /** @type string[] */
  const chain = [];
  let { entry } = reached;
  fragment = reached.fragment ?? fragment;

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
    const { maxReferences } = documentsOf(session);
    if (chain.length > maxReferences) {
      throw codedError(
        `Following more than ${maxReferences} references in a row, at '${relativeFileUrl(href)}'. If that's expected, use a bigger 'maxReferences', or Infinity.`,
        { code: "ERR_TOO_MANY_REFERENCES", maxReferences, chain },
        href
      );
    }

    ({ documentUrl, fragment } = parseUrl(node.href, session.contextUrl));
    const next = await referenced(session, documentUrl, entry, priority);
    entry = next.entry;
    fragment = next.fragment ?? fragment;
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

  const pointer = percentDecoded(fragment);
  if (pointer === undefined || !isJsonPointer(pointer)) {
    throw codedError(`There's no '${fragment}' anchor in '${relativeFileUrl(document.url)}'`, { code: "ERR_ANCHOR_NOT_FOUND", anchor: fragment }, document.url);
  }

  return pointer;
};

/**
 * The entry for the document at a URL that `browse` is asked
 * for. With `referencedFrom`, it's the document a reference in that
 * target's document, or in that document, leads to.
 *
 * @type (session: API.DocumentSession, url: string, options: API.BrowseOptions, priority: PrioritySignal) => Promise<Reached>
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
 * before anything the session has or fetches, and it isn't redirected.
 *
 * @type (session: API.DocumentSession, url: string, from: Entry, priority: PrioritySignal) => Promise<Reached>
 */
const referenced = async (session, url, from, priority) => {
  const document = from.embedded.get(url);
  return document ? { entry: { ...from, document }, fragment: undefined } : load(session, url, causeOf(from), priority);
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

/**
 * A percent-encoded fragment, decoded, or `undefined` if it isn't
 * percent-encoded, like `/a%`
 *
 * @type (fragment: string) => string | undefined
 */
const percentDecoded = (fragment) => {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return undefined;
  }
};

/** @type (priority: API.BrowseOptions["priority"]) => PrioritySignal */
const prioritySignal = (priority) => priority instanceof PrioritySignal ? priority : PrioritySignal.of(priority ?? "auto");

/**
 * A URL as a document's URL and a fragment, which stays percent-encoded
 *
 * @type (url: string | URL, base: string | undefined) => { documentUrl: string, fragment: string }
 */
const parseUrl = (url, base) => {
  const parsed = new URL(url, base);
  const fragment = parsed.hash.slice(1);
  parsed.hash = "";
  return { documentUrl: parsed.href, fragment };
};

/** @type (session: API.DocumentSession) => Documents */
const documentsOf = (session) => session.state(documentsKey, () => {
  const mediaTypes = session.config.mediaTypes ?? defaultMediaTypes;
  const maxReferences = limit("maxReferences", session.config.maxReferences ?? MAX_REFERENCES);
  return { mediaTypes, accept: acceptHeader(mediaTypes), maxReferences, entries: new Map(), retrieved: new WeakMap(), redirected: new Map() };
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
 * @type (session: API.DocumentSession, url: string, cause: Cause, priority: PrioritySignal) => Promise<Reached>
 */
const load = (session, url, cause, priority) => {
  const referrer = referrerFor(cause.initiator, cause.referrer);
  if (!canRefer(url, referrer)) {
    return retrieve(session, url, cause, priority).then(({ entry }) => ({ entry, fragment: undefined }));
  }

  const { entries, redirected } = documentsOf(session);
  /** @type (entry: Entry) => Reached */
  const reachedFrom = (entry) => ({ entry, fragment: redirected.get(url) });
  const existing = entries.get(url);
  if (existing) {
    return existing.loading
      .then((entry) => reachedFrom(referable(entry, url, referrer)))
      .finally(existing.priority.add(priority));
  }

  const group = new PriorityGroup();
  const leave = group.add(priority);
  /** @type Kept */
  const kept = {
    priority: group,
    loading: retrieve(session, url, cause, group.signal).then(({ entry, responseUrl, fragment }) => {
      if (fragment !== undefined) {
        redirected.set(url, fragment);
      }
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
  return kept.loading.then(reachedFrom).finally(leave);
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
 * A document's entry, the URL its response came from, and the fragment a
 * redirect led to, if one did. The URL that's fetched has no fragment, so
 * the last URL a redirect led to only has one a `Location` gave.
 *
 * @type (session: API.DocumentSession, url: string, cause: Cause, priority: PrioritySignal) => Promise<{ entry: Entry, responseUrl: string, fragment: string | undefined }>
 */
const retrieve = async (session, url, cause, priority) => {
  const { mediaTypes, accept, retrieved } = documentsOf(session);
  const response = await session.fetch(url, { ...cause, headers: { accept }, priority });

  try {
    // A response's URL has no fragment, but a redirect's can
    const responseUrl = new URL(response.url);
    responseUrl.hash = "";
    const redirects = responseMeta(response).redirects;
    const landed = redirects && new URL(redirects[redirects.length - 1]).hash;
    const fragment = landed ? landed.slice(1) : undefined;

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
    return { entry, responseUrl: responseUrl.href, fragment };
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
