/**
 * @import * as API from "./node-transport.d.ts"
 */

/** @type typeof API.nodeTransport */
export const nodeTransport = () => {
  throw Error("The Node.js transport isn't supported in this environment. Use defaultTransport.");
};
