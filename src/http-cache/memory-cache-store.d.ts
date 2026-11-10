import type { CachedEntry, CacheStore } from "./http-cache.d.ts";

/** A cache store in memory, with a limit on how many URLs it keeps, least recently used first out */
export class MemoryCacheStore implements CacheStore {
  /** `maxUrls` is 1000 by default */
  constructor(options?: { maxUrls?: number });

  match(url: string): CachedEntry[];
  put(entry: CachedEntry): void;
  delete(url: string): void;

  /** How many URLs it has */
  get size(): number;
}
