import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, rmdir, stat, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { varyMatches } from "./cache-control.js";

/**
 * @import * as API from "./file-cache-store.d.ts"
 * @import { CachedEntry } from "./http-cache.d.ts"
 */

/**
 * @typedef {Omit<CachedEntry, "body"> & { bodyOffset: number, bodyLength: number }} StoredVariant
 * @typedef {{ size: number, used: number }} IndexEntry
 */

/** What every file starts with, with the format's version. A file with another is a miss. */
const magic = Buffer.from("NSC1");

/**
 * The names the store gives its directories, files, and temporary files.
 * Anything else in its directory isn't the store's, so it's left alone.
 */
const shardName = /^[0-9a-f]{2}$/;
const fileName = /^[0-9a-f]{62}$/;
const temporaryName = /^[0-9a-f]{62}\.[0-9a-f]+\.tmp$/;

/**
 * How long a temporary file goes unwritten before it's taken as left by a
 * crash. One that's newer can be a put in flight, in this process or
 * another.
 */
const abandonedAfter = 60 * 60 * 1000;

/** @implements API.FileCacheStore */
export class FileCacheStore {
  /**
   * Operations in flight by file, so ones on the same file run one at a time
   *
   * @type Map<string, Promise<unknown>>
   */
  #locks = new Map();

  /**
   * Each file's size and when it was last used, for eviction, read from the
   * directory the first time it's needed
   *
   * @type Promise<Map<string, IndexEntry>> | undefined
   */
  #index;

  /** @param {API.FileCacheStoreOptions} options */
  constructor(options) {
    this.directory = options.directory;
    this.maxSize = options.maxSize ?? Infinity;
  }

  /** @type API.FileCacheStore["match"] */
  async match(url) {
    const path = this.#pathFor(url);
    return this.#locked(path, async () => {
      const entries = await this.#read(path, url);
      if (entries.length > 0) {
        const known = (await this.#loadIndex()).get(path);
        if (known) {
          known.used = Date.now();
        }
        // The file's time is when it was last used too, so eviction's order
        // outlives the process
        const now = new Date();
        utimes(path, now, now).catch(() => {});
      }
      return entries;
    });
  }

  /** @type API.FileCacheStore["put"] */
  async put(entry) {
    const path = this.#pathFor(entry.url);
    await this.#locked(path, async () => {
      const requestHeaders = new Headers(entry.requestHeaders);
      const others = (await this.#read(path, entry.url)).filter((existing) => !varyMatches(existing, requestHeaders));
      const size = await this.#write(path, [entry, ...others]);
      (await this.#loadIndex()).set(path, { size, used: Date.now() });
    });
    await this.#evict();
  }

  /** @type API.FileCacheStore["delete"] */
  async delete(url) {
    const path = this.#pathFor(url);
    await this.#locked(path, () => this.#remove(path));
  }

  /** @type API.FileCacheStore["clear"] */
  async clear() {
    for (const { shard, files, temporaries } of await this.#own()) {
      for (const path of [...files, ...temporaries]) {
        await rm(path, { force: true });
      }
      // A directory with something that isn't the store's in it stays
      await rmdir(shard).catch(() => {});
    }
    this.#index = Promise.resolve(new Map());
  }

  /** @type API.FileCacheStore["size"] */
  async size() {
    let total = 0;
    for (const { size } of (await this.#loadIndex()).values()) {
      total += size;
    }
    return total;
  }

  /**
   * A file by its URL's hash, in one of 256 directories, so a URL is never a
   * path
   *
   * @type (url: string) => string
   */
  #pathFor(url) {
    const hash = createHash("sha256")
      .update(url)
      .digest("hex");
    return join(this.directory, hash.slice(0, 2), hash.slice(2));
  }

  /**
   * @template T
   * @param {string} path
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async #locked(path, fn) {
    const previous = this.#locks.get(path) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    const settled = run.then(() => {}, () => {});
    this.#locks.set(path, settled);
    void settled.then(() => {
      if (this.#locks.get(path) === settled) {
        this.#locks.delete(path);
      }
    });
    return run;
  }

  /** @type (path: string, url: string) => Promise<CachedEntry[]> */
  async #read(path, url) {
    let data;
    try {
      data = await readFile(path);
    } catch (error) {
      if (/** @type NodeJS.ErrnoException */ (error).code === "ENOENT") {
        return [];
      }
      throw error;
    }
    try {
      return decode(data, url);
    } catch {
      // Damaged, or another format's version
      await this.#remove(path);
      return [];
    }
  }

  /**
   * Write under a temporary name, then rename, so a reader, even in another
   * process, never sees part of a file. Files and the directories made for
   * them are only the user's, because a response can be private, like one
   * to a request with credentials.
   *
   * @type (path: string, entries: CachedEntry[]) => Promise<number>
   */
  async #write(path, entries) {
    const data = encode(entries);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      await writeFile(temporary, data, { mode: 0o600 });
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    return data.byteLength;
  }

  /** @type (path: string) => Promise<void> */
  async #remove(path) {
    await rm(path, { force: true });
    (await this.#loadIndex()).delete(path);
  }

  /** @type () => Promise<Map<string, IndexEntry>> */
  #loadIndex() {
    this.#index ??= this.#scan();
    return this.#index;
  }

  /**
   * Each file's size and time, and temporary files left by a crash removed
   *
   * @type () => Promise<Map<string, IndexEntry>>
   */
  async #scan() {
    /** @type Map<string, IndexEntry> */
    const index = new Map();
    for (const { files, temporaries } of await this.#own()) {
      for (const path of temporaries) {
        const stats = await stat(path).catch(() => undefined);
        if (stats && Date.now() - stats.mtimeMs > abandonedAfter) {
          await rm(path, { force: true });
        }
      }
      for (const path of files) {
        const stats = await stat(path).catch(() => undefined);
        if (stats?.isFile()) {
          index.set(path, { size: stats.size, used: stats.mtimeMs });
        }
      }
    }
    return index;
  }

  /**
   * The store's own directories, with its files and temporary files in each,
   * by their names
   *
   * @type () => Promise<{ shard: string, files: string[], temporaries: string[] }[]>
   */
  async #own() {
    const names = await readdir(this.directory).catch(() => /** @type string[] */ ([]));
    const shards = [];
    for (const name of names.filter((name) => shardName.test(name))) {
      const shard = join(this.directory, name);
      const entries = await readdir(shard).catch(() => /** @type string[] */ ([]));
      shards.push({
        shard,
        files: entries.filter((entry) => fileName.test(entry)).map((entry) => join(shard, entry)),
        temporaries: entries.filter((entry) => temporaryName.test(entry)).map((entry) => join(shard, entry))
      });
    }
    return shards;
  }

  /** @type () => Promise<void> */
  async #evict() {
    if (this.maxSize === Infinity) {
      return;
    }
    const index = await this.#loadIndex();
    let total = 0;
    for (const { size } of index.values()) {
      total += size;
    }
    const oldestFirst = [...index.entries()].toSorted((a, b) => a[1].used - b[1].used);
    for (const [path, { size }] of oldestFirst) {
      if (total <= this.maxSize) {
        break;
      }
      await this.#locked(path, () => this.#remove(path));
      total -= size;
    }
  }
}

/**
 * A file: the magic, the length of the JSON, the variants as JSON, and their
 * bodies one after another
 *
 * @type (entries: CachedEntry[]) => Buffer
 */
const encode = (entries) => {
  let offset = 0;
  /** @type StoredVariant[] */
  const variants = entries.map(({ body, ...rest }) => {
    const variant = { ...rest, bodyOffset: offset, bodyLength: body.byteLength };
    offset += body.byteLength;
    return variant;
  });
  const json = Buffer.from(JSON.stringify({ variants }));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(json.byteLength);
  return Buffer.concat([magic, length, json, ...entries.map((entry) => entry.body)]);
};

/** @type (data: Buffer, url: string) => CachedEntry[] */
const decode = (data, url) => {
  if (data.byteLength < 8 || !data.subarray(0, 4).equals(magic)) {
    throw Error("It isn't a cache file");
  }
  const jsonLength = data.readUInt32BE(4);
  const bodiesStart = 8 + jsonLength;
  if (bodiesStart > data.byteLength) {
    throw Error("It's truncated");
  }
  const { variants } = /** @type {{ variants: StoredVariant[] }} */ (JSON.parse(data.subarray(8, bodiesStart).toString("utf8")));
  return variants.map(({ bodyOffset, bodyLength, ...rest }) => {
    const start = bodiesStart + bodyOffset;
    if (rest.url !== url) {
      throw Error("It's for another URL");
    }
    if (start + bodyLength > data.byteLength) {
      throw Error("Its body is truncated");
    }
    return { ...rest, body: new Uint8Array(data.subarray(start, start + bodyLength)) };
  });
};
