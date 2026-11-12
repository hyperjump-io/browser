import type { FetchRecord } from "../fetch-record.d.ts";
import type { Hyperjump } from "../hyperjump.d.ts";
import type { JrefNode } from "../jref/jref-ast.d.ts";
import type { JsonPointerError } from "../json/jsonast-util.d.ts";
import type { DocumentNode, MediaTypePlugin } from "../media-types/media-types.d.ts";
import type { Priority, PrioritySignal } from "../priority.d.ts";

// What a session's configuration has for documents. The session doesn't
// know documents, so it's added here to what the session declares.
declare module "../hyperjump.d.ts" {
  interface HyperjumpConfig {
    /**
     * The media types documents can be in, as the plugins that parse them.
     * The default is `defaultMediaTypes`: JRef, then JSON. It's a list like
     * any other, so to add one, write `[...defaultMediaTypes, plugin]`. When
     * two plugins match a response equally, the first one parses it.
     */
    mediaTypes?: readonly MediaTypePlugin[];
  }
}

/** What `get` and `getDocument` need of a session. A `Hyperjump` is one. */
export type DocumentSession = Pick<Hyperjump, "fetch" | "state" | "contextUrl" | "config">;

export type GetOptions = {
  /**
   * How urgent the document is, like `fetchpriority` in browsers. The
   * references `get` follows have it too. A document that's asked for again
   * while it's being retrieved has the most urgent priority of whoever is
   * waiting for it, so a document that's preloaded at `"low"` is fetched
   * sooner once something needs it.
   */
  priority?: Priority | PrioritySignal;

  /**
   * What caused the document to be retrieved: an earlier request's record,
   * or its response, like the document with the reference that's being
   * followed. Only a `file:` document can refer to a `file:` URL.
   */
  initiator?: FetchRecord | Response;

  /**
   * The reference that's being followed, or any node of the document it's
   * in, when that's a document the session has. A document it contains is
   * found before anything is retrieved, and it's what caused the request,
   * instead of `initiator`. A node the session doesn't have is ignored.
   */
  referencedFrom?: { location: string };
};

/**
 * A node that isn't a reference. `get` follows every reference it reaches,
 * so the node it returns is one.
 */
export type FollowedNode<T = JrefNode> = Exclude<T, { type: "reference" }>;

/**
 * Retrieve the document at a URL and parse it with the media type plugin
 * for its response. A relative URL is resolved against the session's
 * context URL. The fragment is ignored and references aren't followed.
 *
 * A session keeps each document it retrieves, by its URL, so asking again
 * gives the same document without fetching it, even while it's still being
 * fetched. To see changes, use a new session.
 *
 * The plugin is the one for the response's `Content-Type`, or for a `file:`
 * response, the one for its URL's extension. The request's `Accept` header
 * lists the session's media types.
 *
 * @throws A `TypeError` if `url` isn't a URL, or is relative where there's
 * no context URL.
 * @throws The network error `session.fetch` rejects with.
 * @throws An `Error` whose `cause.code` is `ERR_HTTP_STATUS`, with the
 * `status`, for a response that isn't a success, or
 * `ERR_UNSUPPORTED_MEDIA_TYPE` for a response no plugin parses. Its `url`
 * is the URL that failed.
 * @throws What the plugin's `parse` rejects with, like a `SyntaxError`.
 */
export const getDocument: (session: DocumentSession, url: string | URL, options?: GetOptions) => Promise<DocumentNode>;

/**
 * Retrieve a document like {@link getDocument} and return the node its URL's
 * fragment identifies, which is the document's root without one. What a
 * fragment identifies is its media type's. If the node is a reference, it's
 * followed, and so is any reference that leads to, until there's a value.
 *
 * @throws What {@link getDocument} throws, for the document and for each one
 * a reference leads to.
 * @throws A {@link JsonPointerError} if a fragment doesn't identify a value.
 * @throws An `Error` whose `cause.code` is `ERR_REFERENCE_CYCLE`, with the
 * `chain` of URLs, if following references leads back to one that was
 * already followed.
 */
export const get: (session: DocumentSession, url: string | URL, options?: GetOptions) => Promise<FollowedNode>;
