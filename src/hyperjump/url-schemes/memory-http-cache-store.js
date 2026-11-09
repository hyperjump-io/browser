/**
 * @import { HttpCacheEntry } from "./http-cache-store.d.ts"
 * @import * as API from "./memory-http-cache-store.d.ts"
 */

/** @implements API.MemoryHttpCacheStore */
export class MemoryHttpCacheStore {
  /** @type Map<string, HttpCacheEntry> */
  #entries = new Map();

  /** @type API.MemoryHttpCacheStore["get"] */
  async get(url) {
    return this.#entries.get(url);
  }

  /** @type API.MemoryHttpCacheStore["set"] */
  async set(url, entry) {
    this.#entries.set(url, entry);
  }

  /** @type API.MemoryHttpCacheStore["delete"] */
  async delete(url) {
    this.#entries.delete(url);
  }
}
