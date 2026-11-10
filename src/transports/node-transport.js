import { defaultTransport } from "./scheme-transport.js";
import { fileScheme } from "./file-scheme.js";

/**
 * @import * as API from "./node-transport.d.ts"
 * @import { Fetcher } from "../layers.d.ts"
 */

/** @type typeof API.nodeTransport */
export const nodeTransport = (options = {}) => {
  /** @type Record<string, Fetcher> */
  const extra = { ...options.schemes };
  if (options.file !== false) {
    extra["file:"] = fileScheme(options.file ?? {});
  }
  return defaultTransport(extra);
};
