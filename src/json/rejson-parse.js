import { VFileMessage } from "vfile-message";
import { fromJson } from "./jsonast-util.js";

/**
 * @import { Plugin } from "unified"
 * @import { VFile } from "vfile"
 * @import { Options } from "vfile-message"
 * @import { JsonDocumentNode, JsonNode } from "./jsonast.js"
 * @import { Reviver } from "./jsonast-util.js"
 */


/**
 * @typedef {{
 *   reviver?: Reviver<JsonNode | undefined>;
 * }} JsonParseOptions
 */

/** @type Plugin<[JsonParseOptions?], string, JsonDocumentNode> */
export function rejsonParse(options) {
  /** @type (document: string, file: VFile) => JsonDocumentNode */
  this.parser = function (document, file) {
    try {
      /** @type JsonDocumentNode */
      const jsonDocumentNode = {
        type: "json-document",
        children: []
      };

      const jsonNode = fromJson(document, options?.reviver);
      if (jsonNode) {
        jsonDocumentNode.children.push(jsonNode);
      }

      return jsonDocumentNode;
    } catch (error) {
      if (error instanceof VFileMessage) {
        return file.fail(error.message, /** @type Options */ (error));
      } else {
        throw error;
      }
    }
  };
}
