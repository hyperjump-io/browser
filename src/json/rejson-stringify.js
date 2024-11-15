import { toJson } from "./jsonast-util.js";

/**
 * @import { Plugin } from "unified"
 * @import { Node } from "unist"
 * @import { JsonDocumentNode } from "./jsonast.d.ts"
 */


/**
 * @typedef {{
 *   space?: string;
 * }} RejsonStringifyOptions
 */

/** @type Plugin<[RejsonStringifyOptions?], JsonDocumentNode, string> */
export function rejsonStringify(options) {
  /** @type (tree: Node) => string */
  this.compiler = (tree) => {
    return toJson(/** @type JsonDocumentNode */ (tree), options?.space);
  };
}
