import { HttpUrlSchemePlugin } from "./http-scheme-plugin.js";

/**
 * @import { UrlSchemePlugin } from "./url-scheme-plugin.d.ts"
 */

/** @type () => UrlSchemePlugin[] */
export const defaultUrlSchemePlugins = () => [
  new HttpUrlSchemePlugin()
];
