import { toJref } from "./jref-util.js";

/**
 * @import { Node } from "unist"
 * @import { JrefDocumentNode } from "./jref-ast.js"
 * @import * as API from "./jref-stringify.d.ts"
 */


/** @type API.jrefStringify */
export function jrefStringify(options) {
  /** @type (tree: Node) => string */
  this.compiler = (tree) => {
    const jrefDocument = /** @type JrefDocumentNode */ (tree);
    return toJref(jrefDocument.children[0], jrefDocument.uri, options?.replacer, options?.space) + "\n";
  };
}
