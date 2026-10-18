import { HttpUriSchemePlugin } from "./http-scheme-plugin.js";

/**
 * @import { Hyperjump } from "../index.js"
 * @import { UriSchemePlugin } from "./uri-scheme-plugin.d.ts"
 */

// `fetch` already caches in a browser

/** @type (hyperjump: Hyperjump<any>) => UriSchemePlugin[] */
export const defaultUriSchemePlugins = (hyperjump) => [
  new HttpUriSchemePlugin(hyperjump)
];
