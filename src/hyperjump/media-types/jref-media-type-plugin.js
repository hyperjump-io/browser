import { fromJref } from "../../jref/jref-util.js";

/**
 * @import { MediaTypePlugin } from "./media-type-plugin.js"
 * @import { JrefDocumentNode } from "../../jref/jref-ast.js"
 */


/** @implements MediaTypePlugin<JrefDocumentNode> */
export class JrefMediaTypePlugin {
  /** @type number | undefined */
  quality;

  /**
   * @param {number} [quality]
   */
  constructor(quality) {
    this.quality = quality;
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

  /** @type MediaTypePlugin<JrefDocumentNode>["uriMatcher"] */
  async uriMatcher(uri) { // eslint-disable-line @typescript-eslint/require-await
    return /[^/]\.jref$/.test(uri);
  }
}
