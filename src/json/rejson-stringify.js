import { toJson } from "./jsonast-util.js";

/**
 * @import { Plugin } from "unified"
 * @import { Node } from "unist"
 * @import { JsonDocumentNode } from "./jsonast.js"
 * @import { Replacer } from "./jsonast-util.js"
 */


/**
 * @typedef {{
 *   replacer?: Replacer;
 *   space?: string;
 * }} RejsonStringifyOptions
 */

/**
 * Stringifies a JSON AST to JSON. Includes {@link Replacer} and `space` options
 * similar to the standard
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify | JSON.stringify}
 * function.
 *
 * @type Plugin<[RejsonStringifyOptions?], JsonDocumentNode, string>
 */
export function rejsonStringify(options) {
  /** @type (tree: Node) => string */
  this.compiler = (tree) => {
    return toJson(/** @type JsonDocumentNode */ (tree).children[0], options?.replacer, options?.space) + "\n";
  };
}
