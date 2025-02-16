import { fromJref } from "../../jref/jref-util.js";

/**
 * @import { MediaTypePlugin } from "./media-type-plugin.js"
 * @import { JrefDocumentNode } from "../../jref/jref-ast.js"
 */


/** @implements MediaTypePlugin<JrefDocumentNode> */
export class JrefMediaTypePlugin {
  constructor() {
    this.mediaType = "application/reference+json";
    this.extensions = [".jref"];
  }

  /** @type MediaTypePlugin<JrefDocumentNode>["parse"] */
  async parse(response) {
    return {
      type: "jref-document",
      children: [fromJref(await response.text(), response.url)],
      uri: response.url,
      fragmentKind: "json-pointer"
    };
  }
}
