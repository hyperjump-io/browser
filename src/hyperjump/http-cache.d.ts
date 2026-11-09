import type { Fetch, Layer } from "./layers.js";
import type { HttpCacheStore } from "./url-schemes/http-cache-store.d.ts";

/**
 * The HTTP cache every session from a {@link Hyperjump} shares: the
 * `httpCache` config's store, or the environment's default, and the
 * requests in flight, so sessions that ask for the same URL at the same
 * time share one request.
 */
export class HttpCache {
  constructor(store: HttpCacheStore);

  /**
   * Answer a request from the cache, or with `next`, revalidating a stale
   * response and storing a response its caching headers allow
   */
  retrieve(request: Request, next: Fetch): Promise<Response>;
}

/**
 * The HTTP cache layer, for `http:` and `https:` requests
 */
export const httpCacheLayer: (cache: HttpCache) => Layer;
