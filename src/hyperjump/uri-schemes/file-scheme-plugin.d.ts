import { UriSchemePlugin } from "./uri-scheme-plugin.d.ts";
import { Hyperjump } from "../hyperjump.js";


/**
 * Supports the `file:` URI scheme. Media type is determined by file extensions.
 */
export class FileUriSchemePlugin implements UriSchemePlugin {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(hyperjump: Hyperjump<any>);
  schemes: string[];
  retrieve: UriSchemePlugin["retrieve"];
}
