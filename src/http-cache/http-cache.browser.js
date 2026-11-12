/**
 * @import * as API from "./http-cache.d.ts"
 * @import { Fetcher } from "../layers.d.ts"
 */

const message = "The HTTP cache isn't supported in a browser, which caches responses itself";

export class HttpCache {
  /**
   * @param {Fetcher} _inner
   * @param {API.HttpCacheOptions} [_options]
   */
  constructor(_inner, _options) {
    throw Error(message);
  }
}

/** @type typeof API.httpCache */
export const httpCache = () => {
  throw Error(message);
};
