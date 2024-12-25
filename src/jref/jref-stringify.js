import { toJref } from "./jref-util.js";

/**
 * @import { Plugin } from "unified"
 * @import { Node } from "unist"
 * @import { JrefDocumentNode } from "./jref-ast.d.ts"
 */


/**
 * @typedef {{
 *   space?: string;
 * }} JrefStringifyOptions
 */

/** @type Plugin<[JrefStringifyOptions?], JrefDocumentNode, string> */
export function jrefStringify(options) {
  /** @type (tree: Node) => string */
  this.compiler = (tree) => {
    return toJref(/** @type JrefDocumentNode */ (tree), options?.space);
  };
}
