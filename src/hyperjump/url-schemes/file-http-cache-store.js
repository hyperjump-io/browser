import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * @import { HttpCacheEntry } from "./http-cache-store.d.ts"
 * @import * as API from "./file-http-cache-store.d.ts"
 */

/** @implements API.FileHttpCacheStore */
export class FileHttpCacheStore {
  /** @type string */
  #directory;

  /** @type Promise<unknown> | undefined */
  #ready;

  /**
   * @param {string} directory
   */
  constructor(directory) {
    this.#directory = directory;
  }

  /** @type API.FileHttpCacheStore["get"] */
  async get(url) {
    try {
      return /** @type HttpCacheEntry */ (JSON.parse(await readFile(this.#path(url), "utf8")));
    } catch (error) {
      if (/** @type NodeJS.ErrnoException */ (error).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  /** @type API.FileHttpCacheStore["set"] */
  async set(url, entry) {
    this.#ready ??= mkdir(this.#directory, { recursive: true });
    await this.#ready;

    // Write to a temporary file first so a reader never sees part of an entry
    const temporaryPath = join(this.#directory, `${randomUUID()}.tmp`);
    await writeFile(temporaryPath, JSON.stringify(entry));
    await rename(temporaryPath, this.#path(url));
  }

  /** @type API.FileHttpCacheStore["delete"] */
  async delete(url) {
    await rm(this.#path(url), { force: true });
  }

  /** @type (url: string) => string */
  #path(url) {
    const name = createHash("sha256")
      .update(url)
      .digest("hex");
    return join(this.#directory, `${name}.json`);
  }
}
