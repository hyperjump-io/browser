import { VFileMessage } from "vfile-message";
import { fromJson } from "./jsonast-util.js";

/**
 * @import { Plugin } from "unified"
 * @import { VFile } from "vfile"
 * @import { Options } from "vfile-message"
 * @import { JsonDocumentNode } from "./jsonast.d.ts"
 */


/** @type Plugin<[], string, JsonDocumentNode> */
export function rejsonParse() {
  /** @type (document: string, file: VFile) => JsonDocumentNode */
  this.parser = function (document, file) {
    try {
      /** @type JsonDocumentNode */
      const jsonDocument = {
        type: "json-document",
        children: []
      };

      const node = fromJson(document);
      if (node) {
        jsonDocument.children.push(node);
      }

      return jsonDocument;
    } catch (error) {
      if (error instanceof VFileMessage) {
        return file.fail(error.message, /** @type Options */ (error));
      } else {
        throw error;
      }
    }
  };
}
