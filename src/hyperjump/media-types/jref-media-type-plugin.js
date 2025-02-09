import { fromJref } from "../../jref/jref-util.js";

/**
 * @import { MediaTypePlugin } from "./media-type-plugin.d.ts"
 * @import { JrefDocumentNode, JrefNode } from "../../jref/jref-ast.d.ts"
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
      children: [
        /** @type JrefNode */ (fromJref(await response.text(), response.url))
      ],
      uri: response.url,
      fragmentKind: "json-pointer"
    };
  }

  /** @type MediaTypePlugin<JrefDocumentNode>["fileMatcher"] */
  async fileMatcher(path) { // eslint-disable-line @typescript-eslint/require-await
    return /[^/]\.jref$/.test(path);
  }
}
