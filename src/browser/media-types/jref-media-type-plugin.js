import { fromJref } from "../../jref/jref-util.js";

/**
 * @import { MediaTypePlugin } from "./media-type-plugin.d.ts"
 * @import { JrefDocumentNode } from "../../jref/jref-ast.d.ts"
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
    /** @type JrefDocumentNode */
    const jrefDocument = {
      type: "jref-document",
      children: [],
      uri: response.url,
      fragmentKind: "json-pointer"
    };

    const node = fromJref(await response.text(), response.url);
    if (node) {
      jrefDocument.children.push(node);
    }

    return jrefDocument;
  }

  /** @type MediaTypePlugin<JrefDocumentNode>["fileMatcher"] */
  async fileMatcher(path) { // eslint-disable-line @typescript-eslint/require-await
    return /[^/]\.jref$/.test(path);
  }
}
