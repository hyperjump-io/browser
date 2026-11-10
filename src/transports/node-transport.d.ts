import type { Fetcher } from "../layers.d.ts";
import type { SchemeTransport } from "./scheme-transport.d.ts";
import type { FileSchemeOptions } from "./file-scheme.d.ts";

export type NodeTransportOptions = {
  /** Options for `file:` URLs, or `false` to leave them out */
  file?: FileSchemeOptions | false;

  /** More schemes, or some replaced */
  schemes?: Record<string, Fetcher>;
};

/**
 * The default transport and `file:` URLs, for a server. In a browser, it
 * throws.
 */
export const nodeTransport: (options?: NodeTransportOptions) => SchemeTransport;
