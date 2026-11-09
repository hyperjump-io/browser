import type { HttpCacheEntry, HttpCacheStore } from "./http-cache-store.d.ts";

/**
 * Keeps responses in memory for as long as the store is used. It's the
 * default in Node.js.
 */
export class MemoryHttpCacheStore implements HttpCacheStore {
  get(url: string): Promise<HttpCacheEntry | undefined>;
  set(url: string, entry: HttpCacheEntry): Promise<void>;
  delete(url: string): Promise<void>;
}
