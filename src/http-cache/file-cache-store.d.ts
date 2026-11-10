import type { CachedEntry, CacheStore } from "./http-cache.d.ts";

export type FileCacheStoreOptions = {
  /** The directory to keep the cache in. It's made if it's missing. */
  directory: string;

  /**
   * About how many bytes the cache can grow to. Past it, the least recently
   * used URLs are removed. No limit by default.
   */
  maxSize?: number;
};

/**
 * A cache store on disk, so the HTTP cache outlives the process. In a
 * browser, it throws.
 */
export class FileCacheStore implements CacheStore {
  constructor(options: FileCacheStoreOptions);

  readonly directory: string;
  readonly maxSize: number;

  match(url: string): Promise<CachedEntry[]>;
  put(entry: CachedEntry): Promise<void>;
  delete(url: string): Promise<void>;

  /** Remove everything */
  clear(): Promise<void>;

  /** How many bytes are on disk, as far as this process knows */
  size(): Promise<number>;
}
