import { VFileMessage } from "vfile-message";
import { fromJson } from "./jsonast-util.js";

/**
 * @import { Options } from "vfile-message"
 * @import { JsonDocumentNode } from "./jsonast.js"
 * @import * as API from "./rejson-parse.d.ts"
 */


/** @type API.rejsonParse */
export function rejsonParse(options) {
  this.parser = function (document, file) {
    try {
      /** @type JsonDocumentNode */
      const jsonDocumentNode = {
        type: "json-document",
        children: []
      };

      const jsonNode = fromJson(document, options?.location, options?.reviver);
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
