import type { RetrieveOptions, UrlSchemePlugin } from "./url-scheme-plugin.d.ts";

/**
 * Supports the `file:` URL scheme. A file doesn't have a media type, so its
 * response's `Content-Type` is its extension's (`options.mediaTypeByExtension`).
 *
 * A file is read from its real path, with every symlink in the path
 * resolved, and the response's URL is that real path. References in the file
 * resolve relative to where it really is. Without a symlink, the response's
 * URL is the URL that was requested.
 *
 * This plugin is only available in Node.js-compatible environments. In other
 * environments, such as the browser, constructing it throws an error.
 */
export class FileUrlSchemePlugin implements UrlSchemePlugin {
  constructor();
  schemes: string[];
  retrieve(url: string, options: RetrieveOptions): Promise<Response>;
}
