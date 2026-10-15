import { HttpUriSchemePlugin } from "./http-scheme-plugin.js";
import { FileUriSchemePlugin } from "./file-scheme-plugin.js";

/**
 * @import { Hyperjump } from "../index.js"
 * @import { UriSchemePlugin } from "./uri-scheme-plugin.d.ts"
 */

/** @type (hyperjump: Hyperjump<any>) => UriSchemePlugin[] */
export const defaultUriSchemePlugins = (hyperjump) => [
  new HttpUriSchemePlugin(hyperjump),
  new FileUriSchemePlugin(hyperjump)
];
