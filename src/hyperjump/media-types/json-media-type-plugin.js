import { fromJson } from "../../json/jsonast-util.js";

/**
 * @import { MediaTypePlugin } from "./media-type-plugin.js"
 * @import { JsonDocumentNode } from "../../json/jsonast.js"
 */


/** @implements MediaTypePlugin<JsonDocumentNode> */
export class JsonMediaTypePlugin {
  constructor() {
    this.mediaType = "application/json";
    this.extensions = [".json"];
  }

  /** @type MediaTypePlugin<JsonDocumentNode>["parse"] */
  async parse(response) {
    return {
      type: "json-document",
      children: [fromJson(await response.text())]
    };
  }
}
