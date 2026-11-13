import type { FetchRecord } from "../fetch-record.d.ts";
import type { Hyperjump } from "../hyperjump.d.ts";
import type { JrefNode } from "../jref/jref-ast.d.ts";
import type { JrefMediaTypeDocument } from "../media-types/jref-media-type.d.ts";
import type { JsonMediaTypeDocument } from "../media-types/json-media-type.d.ts";
import type { MediaTypePlugin } from "../media-types/media-types.d.ts";
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

/** What `get` and `documentOf` need of a session. A `Hyperjump` is one. */
export type DocumentSession = Pick<Hyperjump, "fetch" | "state" | "contextUrl" | "config">;

/** The documents the default media types make */
type DefaultDocument = JrefMediaTypeDocument | JsonMediaTypeDocument;

/** The documents the plugins in a list make */
type PluginDocument<M> = M extends readonly (infer P)[]
  ? P extends { parse(...args: any[]): Promise<infer D> } ? D : never
  : never;

/**
 * A document of a session: one that a plugin in its `mediaTypes` makes. A
 * reference can lead to a document in any of them, so it's all of them.
 * It's read from the type of the session's configuration:
 *
 * - With `mediaTypes`, it's what those plugins make.
 * - Without `mediaTypes`, like a session created without a configuration,
 *   it's what the defaults make, JRef and JSON.
 * - With `mediaTypes` that might not be there, like a session that's only
 *   known as a `Hyperjump`, it's both, since either could be so.
 *
 * If a plugin doesn't say what its documents are, like one that's only
 * known as a `MediaTypePlugin`, nothing is known about the session's.
 */
export type SessionDocument<S> = S extends { config: infer C }
  ? "mediaTypes" extends keyof C
    ? PluginDocument<C[keyof C & "mediaTypes"]> | (undefined extends C[keyof C & "mediaTypes"] ? DefaultDocument : never)
    : DefaultDocument
  : never;

/** A node of a session's documents (see {@link SessionDocument}) */
export type SessionNode<S> = SessionDocument<S> extends infer D ? D extends { children: readonly (infer N)[] } ? N : never : never;

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

  /**
   * Whether a reference is followed. It's `true` by default. With `false`,
   * the node the URL identifies is returned even if it's a reference, so
   * it's a node of the document at the URL.
   */
  follow?: boolean;
};

/**
 * A node that isn't a reference. `get` follows every reference it reaches,
 * unless it's told not to, so the node it returns is one.
 */
export type FollowedNode<T = JrefNode> = Exclude<T, { type: "reference" }>;

/**
 * Retrieve the document at a URL, parse it with the media type plugin for
 * its response, and return the node the URL's fragment identifies, which is
 * the document's root without one. What a fragment identifies is its media
 * type's. A relative URL is resolved against the session's context URL.
 *
 * If the node is a reference, it's followed, and so is any reference that
 * leads to, until there's a value. With `follow: false`, the node is
 * returned as it is. {@link documentOf} gives the document a node is in.
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
 * @throws What the plugin's `parse` rejects with, like a `SyntaxError`
 * whose `cause.code` is `ERR_SYNTAX`.
 * @throws What `jsonPointerGet` throws if a fragment doesn't identify a
 * value, like an `Error` whose `cause.code` is `ERR_POINTER_NOT_FOUND`.
 * @throws An `Error` whose `cause.code` is `ERR_REFERENCE_CYCLE`, with the
 * `chain` of URLs, if following references leads back to one that was
 * already followed.
 */
export const get: <S extends DocumentSession, O extends GetOptions = GetOptions>(session: S, url: string | URL, options?: O) => Promise<GetNode<S, O>>;

/**
 * What `get` returns: a node that isn't a reference, unless `follow` is, or
 * could be, `false`
 */
export type GetNode<S, O> = O extends { follow: true } ? FollowedNode<SessionNode<S>>
  : O extends { follow: boolean } ? SessionNode<S>
    : FollowedNode<SessionNode<S>>;

/**
 * The document a node is in, which can be one that another document
 * contains. It's found from the node's location, so it's `undefined` for a
 * node that isn't in a document the session has, like one an application
 * parsed itself.
 *
 * The document at a URL is the one its root is in:
 * `documentOf(session, await get(session, url, { follow: false }))`.
 *
 * It takes what `get` returns, which is `unknown` for a session whose
 * plugins don't say what their documents are.
 */
export const documentOf: <S extends DocumentSession>(session: S, node: SessionNode<S> | { location: string }) => Promise<SessionDocument<S> | undefined>;
