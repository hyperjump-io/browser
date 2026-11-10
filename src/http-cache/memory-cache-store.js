import { varyMatches } from "./cache-control.js";

/**
 * @import * as API from "./memory-cache-store.d.ts"
 * @import { CachedEntry } from "./http-cache.d.ts"
 */

/** @implements API.MemoryCacheStore */
export class MemoryCacheStore {
  /**
   * Variants by URL, in the order they were last used, so the first is the
   * least recently used
   *
   * @type Map<string, CachedEntry[]>
   */
  #entries = new Map();

  /** @type number */
  #maxUrls;

  /** @param {{ maxUrls?: number }} [options] */
  constructor(options = {}) {
    this.#maxUrls = options.maxUrls ?? 1000;
  }

  /** @type API.MemoryCacheStore["match"] */
  match(url) {
    const variants = this.#entries.get(url);
    if (!variants) {
      return [];
    }
    this.#entries.delete(url);
    this.#entries.set(url, variants);
    return variants;
  }

  /** @type API.MemoryCacheStore["put"] */
  put(entry) {
    const requestHeaders = new Headers(entry.requestHeaders);
    const others = (this.#entries.get(entry.url) ?? []).filter((existing) => !varyMatches(existing, requestHeaders));
    this.#entries.delete(entry.url);
    this.#entries.set(entry.url, [entry, ...others]);
    for (const url of this.#entries.keys()) {
      if (this.#entries.size <= this.#maxUrls) {
        break;
      }
      this.#entries.delete(url);
    }
  }

  /** @type API.MemoryCacheStore["delete"] */
  delete(url) {
    this.#entries.delete(url);
  }

  get size() {
    return this.#entries.size;
  }
}
