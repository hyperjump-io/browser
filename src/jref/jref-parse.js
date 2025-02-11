import { pathToFileURL } from "node:url";
import { VFileMessage } from "vfile-message";
import { fromJref } from "./jref-util.js";

/**
 * @import { Plugin } from "unified"
 * @import { VFile } from "vfile"
 * @import { Options } from "vfile-message"
 * @import { JrefDocumentNode } from "./jref-ast.js"
 */


/** @type Plugin<[], string, JrefDocumentNode> */
export function jrefParse() {
  /** @type (document: string, file: VFile) => JrefDocumentNode */
  this.parser = function (document, file) {
    try {
      const uri = pathToFileURL(file.path).toString();
      return {
        type: "jref-document",
        children: [fromJref(document, uri)],
        uri: uri,
        fragmentKind: "json-pointer"
      };
    } catch (error) {
      if (error instanceof VFileMessage) {
        return file.fail(error.message, /** @type Options */ (error));
      } else {
        throw error;
      }
    }
  };
}
