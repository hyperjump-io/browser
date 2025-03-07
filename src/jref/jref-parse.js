import { pathToFileURL } from "node:url";
import { VFileMessage } from "vfile-message";
import { fromJref } from "./jref-util.js";

/**
 * @import { VFile } from "vfile"
 * @import { Options } from "vfile-message"
 * @import { JrefDocumentNode } from "./jref-ast.js"
 * @import * as API from "./jref-parse.d.ts"
 */


/** @type API.jrefParse */
export function jrefParse(options) {
  /** @type (document: string, file: VFile) => JrefDocumentNode */
  this.parser = function (document, file) {
    try {
      const uri = pathToFileURL(file.path).toString();

      /** @type JrefDocumentNode */
      const jrefDocumentNode = {
        type: "jref-document",
        children: [],
        uri: uri,
        fragmentKind: "json-pointer"
      };

      const jrefNode = fromJref(document, uri, options?.reviver);
      if (jrefNode) {
        jrefDocumentNode.children.push(jrefNode);
      }

      return jrefDocumentNode;
    } catch (error) {
      if (error instanceof VFileMessage) {
        return file.fail(error.message, /** @type Options */ (error));
      } else {
        throw error;
      }
    }
  };
}
