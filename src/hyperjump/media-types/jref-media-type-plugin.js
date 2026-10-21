import { fromJref } from "../../jref/jref-util.js";
import { fatalSyntaxError } from "../../json/report-syntax-errors.js";

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
      throw fatalSyntaxError(result.errors[0]);
    }

    return {
      type: "jref-document",
      status: result.status,
      children: [result.node],
      comments: [],
      uri: response.url
    };
  }

  /** @type API.JrefMediaTypePlugin["fragmentPointer"] */
  fragmentPointer(_document, fragment) {
    return decodeURIComponent(fragment);
  }
}
