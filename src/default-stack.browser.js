import { defaultTransport } from "./transports/scheme-transport.js";

/**
 * @import * as API from "./default-stack.d.ts"
 */

/** @type typeof API.defaultStack */
export const defaultStack = () => defaultTransport();
