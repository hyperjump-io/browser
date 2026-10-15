import { pathToUri } from "#path-to-uri";
import { VFileMessage } from "vfile-message";
import { fromJref } from "./jref-util.js";

/**
 * @import { JrefDocumentNode } from "./jref-ast.js"
 * @import * as API from "./jref-parse.d.ts"
 */

/** @type API.jrefParse */
export function jrefParse(options) {
  this.parser = function (document, file) {
    try {
      const uri = file.path ? pathToUri(file.cwd, file.path) : undefined;

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
        return file.fail(error.reason, {
          place: error.place,
          ruleId: error.ruleId,
          source: error.source
        });
      } else {
        throw error;
      }
    }
  };
}
