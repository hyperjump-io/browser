import { scheduler } from "./layers/scheduler.js";
import { nodeTransport } from "./transports/node-transport.js";

/**
 * @import { Fetcher } from "./layers.d.ts"
 */

/**
 * A session's stack when it isn't given one. Node.js opens a connection for
 * every `fetch`, so requests to an origin are limited as a browser limits
 * them.
 *
 * @type () => Fetcher
 */
export const defaultStack = () => scheduler()(nodeTransport());
