/**
 * @import * as API from "./file-http-cache-store.d.ts"
 */

const notSupported = "The file HTTP cache store is not supported in this environment";

/** @implements API.FileHttpCacheStore */
export class FileHttpCacheStore {
  /**
   * @param {string} _directory
   */
  constructor(_directory) {
    throw Error(notSupported);
  }

  /** @type API.FileHttpCacheStore["get"] */
  async get() {
    throw Error(notSupported);
  }

  /** @type API.FileHttpCacheStore["set"] */
  async set() {
    throw Error(notSupported);
  }

  /** @type API.FileHttpCacheStore["delete"] */
  async delete() {
    throw Error(notSupported);
  }
}
