import { MemoryHttpCacheStore } from "./memory-http-cache-store.js";

/**
 * @import { HttpCacheStore } from "./http-cache-store.d.ts"
 */

/** @type () => HttpCacheStore | undefined */
export const defaultHttpCache = () => new MemoryHttpCacheStore();
