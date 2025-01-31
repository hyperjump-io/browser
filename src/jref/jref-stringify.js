import { toJref } from "./jref-util.js";

/**
 * @import { Plugin } from "unified"
 * @import { Node } from "unist"
 * @import { JrefDocumentNode } from "./jref-ast.d.ts"
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
    return toJref(/** @type JrefDocumentNode */ (tree).children[0], options?.replacer, options?.space);
  };
}
