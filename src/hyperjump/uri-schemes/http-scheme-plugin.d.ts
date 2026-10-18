import type { GetOptions, Hyperjump } from "../hyperjump.js";
import type { UriSchemePlugin } from "./uri-scheme-plugin.d.ts";
import type { HttpCacheStore } from "./http-cache-store.d.ts";

/**
 * Support the `http:` and `https:` URI schemes. Sends an Accept header
 * representing all registered media types.
 *
 * With a cache, responses are cached according to their caching headers
 * (RFC 9111, as a private cache), and stale responses are revalidated when
 * they have an `ETag` or `Last-Modified`. Concurrent requests for the same URL
 * share one request. In Node.js, the default plugin caches in memory. In a
 * browser, it doesn't have a cache, because `fetch` already caches.
 */
export class HttpUriSchemePlugin implements UriSchemePlugin {
  constructor(hyperjump: Hyperjump<any>, options?: HttpUriSchemePluginOptions);

  schemes: string[];

  /**
   * @throws {@link HttpError}
   */
  retrieve(uri: string, options: GetOptions): Promise<Response>;
}

export type HttpUriSchemePluginOptions = {
  /** Where to cache responses. Without one, nothing is cached. */
  cache?: HttpCacheStore;
};

/**
 * Thrown when an HTTP request returns an error or an unsupported status code.
 */
export class HttpError extends Error {
  response: Response;

  constructor(response: Response, message?: string);
}
