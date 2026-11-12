import { relativeFileUrl } from "../file-urls.js";
import { jsonPointerGet } from "../json/jsonast-util.js";
import { acceptHeader, defaultMediaTypes, mediaTypeForContentType, mediaTypeForExtension } from "../media-types/media-types.js";
import { responseMeta } from "../response-meta.js";

/**
 * @import * as API from "./documents.d.ts"
 * @import { FetchRecord } from "../fetch-record.d.ts"
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { DocumentNode, MediaTypePlugin } from "../media-types/media-types.d.ts"
 */

/**
 * A document a session has: the document, the plugin that parsed it, which
 * says what its fragments identify, its response's record, which is the
 * initiator of the requests its references cause, and the documents it
 * contains, by URL. A document found in another has its container's plugin,
 * record, and set.
 *
 * @typedef {{
 *   document: DocumentNode,
 *   mediaType: MediaTypePlugin,
 *   record: FetchRecord | undefined,
 *   embedded: ReadonlyMap<string, DocumentNode>
 * }} Entry
 */

/**
 * What a session keeps for documents: the entries by URL, as promises, so a
 * document that's asked for again while it's fetched or parsed is the same
 * one, and what its media types work out to.
 *
 * `contained` is the entries of the documents that documents contain, by
 * the URL each says it has. Nothing is found there by its URL alone, since
 * two documents can say they contain the same one. It's where the document
 * a node is in is looked for.
 *
 * @typedef {{
 *   mediaTypes: readonly MediaTypePlugin[],
 *   accept: string,
 *   entries: Map<string, Promise<Entry>>,
 *   contained: Map<string, Entry[]>
 * }} Documents
 */

/** The key of a session's documents in its state */
const documentsKey = {};

/** @type typeof API.getDocument */
export const getDocument = async (session, url, options = {}) => {
  const { documentUrl } = parseUrl(session, url);
  const { document } = await load(session, documentUrl, options.initiator);
  return document;
};

/** @type typeof API.get */
export const get = async (session, url, options = {}) => {
  let { documentUrl, fragment } = parseUrl(session, url);
  const from = options.referencedFrom && await entryOf(session, options.referencedFrom);
  let entry = from ? await referenced(session, documentUrl, from) : await load(session, documentUrl, options.initiator);
  /** @type string[] */
  const chain = [];

  for (;;) {
    const href = `${documentUrl}#${fragment}`;
    if (chain.includes(href)) {
      throw documentError(`Following references led back to '${relativeFileUrl(href)}'`, { code: "ERR_REFERENCE_CYCLE", chain: [...chain, href] }, href);
    }
    chain.push(href);

    const pointer = entry.mediaType.fragmentPointer?.(entry.document, fragment) ?? "";
    const node = jsonPointerGet(pointer, /** @type JrefNode */ (entry.document.children[0]));
    if (node.type !== "reference") {
      return node;
    }

    ({ documentUrl, fragment } = parseUrl(session, node.href));
    entry = await referenced(session, documentUrl, entry);
  }
};

/**
 * The entry for the document a reference in `from`'s document leads to. A
 * document that `from`'s contains, or that's contained with it, is found
 * before anything the session has or fetches.
 *
 * @type (session: API.DocumentSession, url: string, from: Entry) => Promise<Entry>
 */
const referenced = async (session, url, from) => {
  const document = from.embedded.get(url);
  return document ? { ...from, document } : load(session, url, from.record);
};

/**
 * The entry of the document a node is in, if the session has it: the
 * document at the node's location, or one that a document contains under
 * that URL. Which one is checked by finding the node in it, since two
 * documents can say they contain a document with the same URL.
 *
 * @type (session: API.DocumentSession, node: { location: string }) => Promise<Entry | undefined>
 */
const entryOf = async (session, node) => {
  const { entries, contained } = documentsOf(session);
  const { documentUrl, fragment } = parseUrl(session, node.location);
  const pointer = decodeURIComponent(fragment);

  const kept = await entries.get(documentUrl)?.catch(() => undefined);
  for (const entry of [...kept ? [kept] : [], ...contained.get(documentUrl) ?? []]) {
    try {
      if (jsonPointerGet(pointer, /** @type JrefNode */ (entry.document.children[0])) === node) {
        return entry;
      }
    } catch {
      // The location isn't in this document
    }
  }
  return undefined;
};

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
  return { mediaTypes, accept: acceptHeader(mediaTypes), entries: new Map(), contained: new Map() };
});

/**
 * The session's entry for a URL, retrieved if it doesn't have one. A
 * document is also kept under the URL its response came from, like where a
 * redirect led, so there's one document for a URL however it was reached.
 * One that fails isn't kept, so it can be asked for again.
 *
 * @type (session: API.DocumentSession, url: string, initiator: API.GetOptions["initiator"]) => Promise<Entry>
 */
const load = (session, url, initiator) => {
  const { entries } = documentsOf(session);
  const existing = entries.get(url);
  if (existing) {
    return existing;
  }

  /** @type Promise<Entry> */
  const loading = retrieve(session, url, initiator).then((entry) => {
    const finalUrl = entry.document.url;
    const reached = entries.get(finalUrl);
    if (reached && reached !== loading) {
      return reached;
    }
    entries.set(finalUrl, loading);
    return entry;
  });
  entries.set(url, loading);
  loading.catch(() => {
    if (entries.get(url) === loading) {
      entries.delete(url);
    }
  });
  return loading;
};

/** @type (session: API.DocumentSession, url: string, initiator: API.GetOptions["initiator"]) => Promise<Entry> */
const retrieve = async (session, url, initiator) => {
  const { mediaTypes, accept, contained } = documentsOf(session);
  const response = await session.fetch(url, { headers: { accept }, initiator });

  try {
    // A response a layer made can have no URL, and one a redirect led to
    // has the request's fragment
    const responseUrl = new URL(response.url || url);
    responseUrl.hash = "";

    if (!response.ok) {
      throw documentError(`'${relativeFileUrl(responseUrl.href)}' can't be used, because its response's status is ${response.status}`, { code: "ERR_HTTP_STATUS", status: response.status }, responseUrl.href);
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
      throw documentError(`'${relativeFileUrl(responseUrl.href)}' can't be used, because ${reason}. Use the session's 'mediaTypes' to add support for a media type.`, { code: "ERR_UNSUPPORTED_MEDIA_TYPE" }, responseUrl.href);
    }

    const document = await mediaType.parse({ text: () => response.text(), url: responseUrl.href });
    /** @type Entry */
    const entry = { document, mediaType, record: responseMeta(response).record, embedded: embeddedIn(document) };
    for (const [embeddedUrl, embeddedDocument] of entry.embedded) {
      contained.set(embeddedUrl, [...contained.get(embeddedUrl) ?? [], { ...entry, document: embeddedDocument }]);
    }
    return entry;
  } catch (error) {
    // A body that wasn't read holds its file or connection
    if (!response.bodyUsed) {
      await response.body?.cancel().catch(() => {});
    }
    throw error;
  }
};

/**
 * The documents a document contains, by their URLs as they're compared:
 * parsed, without fragments.
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
      throw documentError(`'${document.url}' can't be used, because it says it contains a document with an absolute file: URL`, { code: "ERR_ABSOLUTE_FILE_URL" }, document.url);
    }
    parsed.hash = "";
    embedded.set(parsed.href, contained);
  }
  return embedded;
};

/**
 * Why a document can't be used, when it isn't a network error. Like a
 * network error, its `cause.code` says why to code, and its `url` is the
 * exact URL.
 *
 * @type (message: string, cause: { code: string, [key: string]: unknown }, url: string) => Error & { url: string }
 */
const documentError = (message, cause, url) => Object.assign(new Error(message, { cause }), { url });
