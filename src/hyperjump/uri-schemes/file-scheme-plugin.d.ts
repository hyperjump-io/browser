import type { RetrieveOptions, UriSchemePlugin } from "./uri-scheme-plugin.d.ts";

/**
 * Supports the `file:` URI scheme. A file's response doesn't have a
 * `Content-Type`, so its media type is its extension's.
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
  constructor();
  schemes: string[];
  retrieve(uri: string, options: RetrieveOptions): Promise<Response>;
}
