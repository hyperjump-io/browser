import { fromJref } from "../../jref/jref-util.js";

/**
 * @import * as API from "./jref-media-type-plugin.d.ts"
 */


/** @implements API.JrefMediaTypePlugin */
export class JrefMediaTypePlugin {
  constructor() {
    this.mediaType = "application/reference+json";
    this.extensions = [".jref"];
  }

  /** @type API.JrefMediaTypePlugin["parse"] */
  async parse(response) {
    return {
      type: "jref-document",
      children: [fromJref(await response.text(), response.url)],
      uri: response.url,
      fragmentKind: "json-pointer"
    };
  }
}
