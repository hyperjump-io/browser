import type { UrlSchemePlugin } from "./url-scheme-plugin.d.ts";
import type { HttpCacheStore } from "./http-cache-store.d.ts";
import type { HttpError, HyperjumpConfig } from "../hyperjump.d.ts";

/**
 * Support the `http:` and `https:` URL schemes. Sends the request's headers,
 * like `Accept` and the `headers` config's, except `Referer`, which can be a
 * file's URL. A response has to have a
 * `Content-Type`, because a URL's extension doesn't say what's at it, unless
 * its URL is one of the `mediaTypeByExtension` config's (see
 * {@link HyperjumpConfig}).
 *
 * With a cache, responses are cached according to their caching headers
 * (RFC 9111, as a private cache), and stale responses are revalidated when
 * they have an `ETag` or `Last-Modified`. Concurrent requests for the same URL
 * share one request. In Node.js, it caches in memory by default. In a
 * browser, it doesn't have a cache by default, because `fetch` already
 * caches.
 */
export class HttpUrlSchemePlugin implements UrlSchemePlugin {
  constructor(options?: HttpUrlSchemePluginOptions);

  schemes: string[];

  /**
   * @throws An {@link HttpError} if the response is an error or has a status
   * code that isn't supported
   */
  retrieve(request: Request): Promise<Response>;
}

export type HttpUrlSchemePluginOptions = {
  /**
   * Where to cache responses. Without one, it's the environment's default:
   * in memory in Node.js, and none in a browser, where `fetch` already
   * caches. `false` doesn't cache.
   */
  cache?: HttpCacheStore | false;
};
