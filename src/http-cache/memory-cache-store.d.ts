import type { CachedEntry, CacheStore } from "./http-cache.d.ts";

/**
 * A cache store in memory, with a limit on how many bytes it keeps, least
 * recently used first out
 */
export class MemoryCacheStore implements CacheStore {
  /**
   * `maxSize` is how many bytes it keeps, its bodies and their headers. It's
   * 64 MB by default. A URL whose responses are bigger than that on their
   * own isn't kept.
   */
  constructor(options?: { maxSize?: number });

  match(url: string): CachedEntry[];
  put(entry: CachedEntry): void;
  delete(url: string): void;

  /** How many bytes it keeps, its bodies and their headers */
  get size(): number;
}
