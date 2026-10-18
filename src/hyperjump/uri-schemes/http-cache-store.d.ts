/**
 * Where {@link HttpUriSchemePlugin} keeps the responses it caches. Entries are
 * keyed by request URL and are JSON, so a store can keep them anywhere.
 */
export interface HttpCacheStore {
  get(url: string): Promise<HttpCacheEntry | undefined>;
  set(url: string, entry: HttpCacheEntry): Promise<void>;
  delete(url: string): Promise<void>;
}

export type HttpCacheEntry = {
  /** The URL the response came from, which can differ from the request URL after redirects */
  url: string;

  body: string;

  /** The serialized cache policy from `http-cache-semantics` */
  policy: object;
};
