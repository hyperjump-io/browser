import { defaultTransport } from "./transports/scheme-transport.js";

/**
 * @import { Fetcher } from "./layers.d.ts"
 */

/**
 * A session's stack when it isn't given one. A browser limits connections
 * and caches by itself.
 *
 * @type () => Fetcher
 */
export const defaultStack = () => defaultTransport();
