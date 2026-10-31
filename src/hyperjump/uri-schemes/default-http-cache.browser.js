/**
 * @import { HttpCacheStore } from "./http-cache-store.d.ts"
 */

// `fetch` already caches in a browser

/** @type () => HttpCacheStore | undefined */
export const defaultHttpCache = () => undefined;
