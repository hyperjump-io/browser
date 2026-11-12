import { scheduler } from "./layers/scheduler.js";
import { nodeTransport } from "./transports/node-transport.js";

/**
 * @import * as API from "./default-stack.d.ts"
 */

/** @type typeof API.defaultStack */
export const defaultStack = () => scheduler()(nodeTransport());
