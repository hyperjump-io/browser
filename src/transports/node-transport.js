import { defaultTransport } from "./scheme-transport.js";
import { fileScheme } from "./file-scheme.js";

/**
 * @import * as API from "./node-transport.d.ts"
 * @import { Fetcher } from "../layers.d.ts"
 */

/** @type typeof API.nodeTransport */
export const nodeTransport = (options = {}) => {
  /** @type Record<string, Fetcher> */
  const file = options.file === false ? {} : { "file:": fileScheme(options.file ?? {}) };
  return defaultTransport({ ...file, ...options.schemes });
};
