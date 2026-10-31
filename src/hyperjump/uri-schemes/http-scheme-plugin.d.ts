import type { RetrieveOptions, UriSchemePlugin } from "./uri-scheme-plugin.d.ts";
import type { HttpCacheStore } from "./http-cache-store.d.ts";

/**
 * Support the `http:` and `https:` URI schemes. Sends the Accept header
 * {@link Hyperjump.retrieve} gives it, for the media types that are
 * supported. A response has to have a `Content-Type`.
 *
 * With a cache, responses are cached according to their caching headers
 * (RFC 9111, as a private cache), and stale responses are revalidated when
 * they have an `ETag` or `Last-Modified`. Concurrent requests for the same URL
 * share one request. In Node.js, it caches in memory by default. In a
 * browser, it doesn't have a cache by default, because `fetch` already
 * caches.
 */
export class HttpUriSchemePlugin implements UriSchemePlugin {
  constructor(options?: HttpUriSchemePluginOptions);

  schemes: string[];

  /**
   * @throws An {@link HttpError} if the response is an error or has a status
   * code that isn't supported, or an `UnknownMediaTypeError` if it doesn't
   * have a `Content-Type`.
   */
  retrieve(uri: string, options: RetrieveOptions): Promise<Response>;
}

export type HttpUriSchemePluginOptions = {
  /**
   * Where to cache responses. Without one, it's the environment's default:
   * in memory in Node.js, and none in a browser, where `fetch` already
   * caches. `false` doesn't cache.
   */
  cache?: HttpCacheStore | false;

  /**
   * Headers to send with requests, such as credentials, by URL. A URL that
   * ends with `/` gets its headers for everything under it. Any other gets
   * them only for itself. Only the URLs listed get headers, because
   * documents can reference any URL. A URL has to be an absolute `http:` or
   * `https:` URL, or the plugin throws when it's created.
   *
   * A value can be a {@link HeadersFunction}, to refresh a token for
   * example. When more than one URL matches, their headers are merged, and
   * a longer URL's headers win. The `Accept` header is always the one
   * `retrieve` is given.
   *
   * A redirected request is sent with the same headers. `fetch` drops
   * `Authorization` and `Cookie` on a redirect to another origin, but not
   * other headers.
   *
   * The cache is private, so a response retrieved with credentials is used
   * for any later request for the same URL that it satisfies, including ones
   * the headers would be different for, unless the response has a `Vary`
   * for them. Different credentials for the same URL need plugins that
   * don't share a cache.
   */
  headers?: Record<string, HeadersInit | HeadersFunction>;
};

/**
 * Headers for a request, called with the URL that's requested. It can be
 * async.
 */
export type HeadersFunction = (url: URL) => HeadersInit | undefined | Promise<HeadersInit | undefined>;

/**
 * Thrown when an HTTP request returns an error or an unsupported status code.
 */
export class HttpError extends Error {
  response: Response;

  constructor(response: Response, message?: string);
}
