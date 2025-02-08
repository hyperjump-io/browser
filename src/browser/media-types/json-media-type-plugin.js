import { fromJson } from "../../json/jsonast-util.js";

/**
 * @import { MediaTypePlugin } from "./media-type-plugin.d.ts"
 * @import { JsonDocumentNode, JsonNode } from "../../json/jsonast.js"
 */


/** @implements MediaTypePlugin<JsonDocumentNode> */
export class JsonMediaTypePlugin {
  /** @type number | undefined */
  quality;

  /**
   * @param {number} [quality]
   */
  constructor(quality) {
    this.quality = quality;
  }

  /** @type MediaTypePlugin<JsonDocumentNode>["parse"] */
  async parse(response) {
    return {
      type: "json-document",
      children: [
        /** @type JsonNode */ (fromJson(await response.text()))
      ]
    };
  }

  /** @type MediaTypePlugin<JsonDocumentNode>["fileMatcher"] */
  async fileMatcher(path) { // eslint-disable-line @typescript-eslint/require-await
    return /[^/]\.json$/.test(path);
  }
}
