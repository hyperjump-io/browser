/**
 * @import * as API from "./file-scheme-plugin.d.ts"
 */

const notSupported = "The 'file:' URI scheme is not supported in this environment";

/** @implements API.FileUriSchemePlugin */
export class FileUriSchemePlugin {
  /** @type string[] */
  schemes = [];

  constructor() {
    throw Error(notSupported);
  }

  /** @type API.FileUriSchemePlugin["retrieve"] */
  async retrieve() {
    throw Error(notSupported);
  }
}
