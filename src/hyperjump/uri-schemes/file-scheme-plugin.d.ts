import type { UriSchemePlugin } from "./uri-scheme-plugin.d.ts";
import type { Hyperjump } from "../hyperjump.js";

/**
 * Supports the `file:` URI scheme. Media type is determined by file extensions.
 *
 * This plugin is only available in Node.js-compatible environments. In other
 * environments, such as the browser, constructing it throws an error.
 */
export class FileUriSchemePlugin implements UriSchemePlugin {
  constructor(hyperjump: Hyperjump<any>);
  schemes: string[];
  retrieve: UriSchemePlugin["retrieve"];
}
