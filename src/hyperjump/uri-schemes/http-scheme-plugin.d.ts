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
   * @throws An {@link HttpError} if the response is an error or has a status
   * code that isn't supported.
   */
  retrieve(uri: string, options: GetOptions): Promise<Response>;
}

export type HttpUriSchemePluginOptions = {
  /** Where to cache responses. Without one, nothing is cached. */
  cache?: HttpCacheStore;

  /**
   * Headers to send with a request, such as credentials. It's called with
   * each URL that's requested, so headers can be sent only to the origins
   * they're for. Documents can reference any URL, so don't send
   * credentials to every URL. It can be async, to refresh a token for
   * example. The `Accept` header is always the plugin's.
   *
   * A redirected request is sent with the same headers. `fetch` drops
   * `Authorization` and `Cookie` on a redirect to another origin, but not
   * other headers.
   *
   * The cache is private, so a response retrieved with credentials is used
   * for any later request for the same URL that it satisfies, including ones
   * the headers would be different for, unless the response has a `Vary`
   * for them. Don't share a cache between plugins with different
   * credentials.
   */
  headers?: (url: URL) => HeadersInit | undefined | Promise<HeadersInit | undefined>;
};

/**
 * Thrown when an HTTP request returns an error or an unsupported status code.
 */
export class HttpError extends Error {
  response: Response;

  constructor(response: Response, message?: string);
}
