import { pathToFileURL } from "node:url";
import { VFileMessage } from "vfile-message";
import { fromJref } from "./jref-util.js";

/**
 * @import { Plugin } from "unified"
 * @import { VFile } from "vfile"
 * @import { Options } from "vfile-message"
 * @import { JrefDocumentNode } from "./jref-ast.d.ts"
 */


/** @type Plugin<[], string, JrefDocumentNode> */
export function jrefParse() {
  /** @type (document: string, file: VFile) => JrefDocumentNode */
  this.parser = function (document, file) {
    try {
      return {
        type: "jref-document",
        children: [fromJref(document)],
        uri: pathToFileURL(file.path).toString(),
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
