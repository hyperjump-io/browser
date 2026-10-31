import { HttpUriSchemePlugin } from "./http-scheme-plugin.js";

/**
 * @import { UriSchemePlugin } from "./uri-scheme-plugin.d.ts"
 */

/** @type () => UriSchemePlugin[] */
export const defaultUriSchemePlugins = () => [
  new HttpUriSchemePlugin()
];
