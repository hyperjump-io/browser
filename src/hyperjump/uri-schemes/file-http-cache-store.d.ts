import type { HttpCacheEntry, HttpCacheStore } from "./http-cache-store.d.ts";

/**
 * Keeps responses in files in a directory, so they outlive the process.
 *
 * This store is only available in Node.js-compatible environments. In other
 * environments, such as the browser, constructing it throws an error.
 */
export class FileHttpCacheStore implements HttpCacheStore {
  /** The directory is created if it doesn't exist. */
  constructor(directory: string);

  get(url: string): Promise<HttpCacheEntry | undefined>;
  set(url: string, entry: HttpCacheEntry): Promise<void>;
  delete(url: string): Promise<void>;
}
