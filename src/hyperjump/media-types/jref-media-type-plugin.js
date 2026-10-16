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
    const result = fromJref(await response.text(), response.url);
    if (result.status !== "success") {
      result.messages[0].fatal = true;
      throw result.messages[0];
    }

    return {
      type: "jref-document",
      status: result.status,
      children: [result.node],
      comments: [],
      uri: response.url,
      fragmentKind: "json-pointer"
    };
  }
}
