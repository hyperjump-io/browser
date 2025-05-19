import { toJson } from "../json/jsonast-util.js";

/**
 * @import { JrefDocumentNode } from "./jref-ast.js"
 * @import * as API from "./jref-stringify.d.ts"
 */


/** @type API.jrefStringify */
export function jrefStringify(options) {
  this.compiler = (tree) => {
    const jrefDocument = /** @type JrefDocumentNode */ (tree);
    return toJson(jrefDocument.children[0], options?.replacer, options?.space) + "\n";
  };
}
