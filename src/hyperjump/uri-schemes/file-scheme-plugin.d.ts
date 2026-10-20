import type { UriSchemePlugin } from "./uri-scheme-plugin.d.ts";
import type { GetOptions, Hyperjump } from "../hyperjump.js";

/**
 * Supports the `file:` URI scheme. Media type is determined by file extensions.
 *
 * A file is read from its real path, with every symlink in the path
 * resolved, and the response's URL is that real path. References in the file
 * resolve relative to where it really is. Without a symlink, the response's
 * URL is the URI that was requested, without its fragment.
 *
 * This plugin is only available in Node.js-compatible environments. In other
 * environments, such as the browser, constructing it throws an error.
 */
export class FileUriSchemePlugin implements UriSchemePlugin {
  constructor(hyperjump: Hyperjump<any>);
  schemes: string[];
  retrieve(uri: string, options: GetOptions): Promise<Response>;
}
