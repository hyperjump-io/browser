import { HttpUriSchemePlugin } from "./http-scheme-plugin.js";

/**
 * @import { UriSchemePlugin } from "./uri-scheme-plugin.d.ts"
 */

// `fetch` already caches in a browser

/** @type () => UriSchemePlugin[] */
export const defaultUriSchemePlugins = () => [
  new HttpUriSchemePlugin()
];
