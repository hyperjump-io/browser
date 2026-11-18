import { varyMatches } from "./cache-control.js";

/**
 * @import * as API from "./memory-cache-store.d.ts"
 * @import { CachedEntry } from "./http-cache.d.ts"
 */

/** The default `maxSize`: 64 MB */
const MAX_SIZE = 64 * 1024 * 1024;

/** @implements API.MemoryCacheStore */
export class MemoryCacheStore {
  /**
   * Variants by URL, in the order they were last used, so the first is the
   * least recently used, with how many bytes they are
   *
   * @type Map<string, { variants: CachedEntry[], size: number }>
   */
  #entries = new Map();

  /** @type number */
  #size = 0;

  /** @type number */
  #maxSize;

  /** @param {{ maxSize?: number }} [options] */
  constructor(options = {}) {
    this.#maxSize = options.maxSize ?? MAX_SIZE;
  }

  /** @type API.MemoryCacheStore["match"] */
  match(url) {
    const kept = this.#entries.get(url);
    if (!kept) {
      return [];
    }
    this.#entries.delete(url);
    this.#entries.set(url, kept);
    return kept.variants;
  }

  /**
   * Keep an entry, and forget the least recently used URLs until the store
   * is within `maxSize`, which can be the URL that was put, if it's bigger
   * than that on its own
   *
   * @type API.MemoryCacheStore["put"]
   */
  put(entry) {
    const requestHeaders = new Headers(entry.requestHeaders);
    const others = (this.#entries.get(entry.url)?.variants ?? []).filter((existing) => !varyMatches(existing, requestHeaders));
    this.delete(entry.url);
    const variants = [entry, ...others];
    const size = variants.reduce((total, variant) => total + sizeOf(variant), 0);
    this.#entries.set(entry.url, { variants, size });
    this.#size += size;

    for (const url of this.#entries.keys()) {
      if (this.#size <= this.#maxSize) {
        break;
      }
      this.delete(url);
    }
  }

  /** @type API.MemoryCacheStore["delete"] */
  delete(url) {
    const kept = this.#entries.get(url);
    if (kept) {
      this.#size -= kept.size;
      this.#entries.delete(url);
    }
  }

  get size() {
    return this.#size;
  }
}

/**
 * About how many bytes an entry is: its body, and its URL's and headers'
 * characters, which are bytes for the ASCII that headers are
 *
 * @type (entry: CachedEntry) => number
 */
const sizeOf = (entry) => {
  let size = entry.body.byteLength + entry.url.length + entry.statusText.length;
  for (const [name, value] of [...entry.headers, ...entry.requestHeaders]) {
    size += name.length + value.length;
  }
  return size;
};
