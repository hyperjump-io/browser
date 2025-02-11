import { toJref } from "./jref-util.js";

/**
 * @import { Plugin } from "unified"
 * @import { Node } from "unist"
 * @import { JrefDocumentNode } from "./jref-ast.js"
 * @import { Replacer } from "./jref-util.js"
 */


/**
 * @typedef {{
 *   replacer?: Replacer;
 *   space?: string;
 * }} JrefStringifyOptions
 */

/** @type Plugin<[JrefStringifyOptions?], JrefDocumentNode, string> */
export function jrefStringify(options) {
  /** @type (tree: Node) => string */
  this.compiler = (tree) => {
    const jrefDocument = /** @type JrefDocumentNode */ (tree);
    return toJref(jrefDocument.children[0], jrefDocument.uri, options?.replacer, options?.space) + "\n";
  };
}
