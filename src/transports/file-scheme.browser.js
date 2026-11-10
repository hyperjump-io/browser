/**
 * @import * as API from "./file-scheme.d.ts"
 */

/** @type typeof API.fileScheme */
export const fileScheme = () => {
  throw Error("The 'file:' URL scheme isn't supported in this environment");
};
