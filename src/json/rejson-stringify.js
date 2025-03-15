import { toJson } from "./jsonast-util.js";

/**
 * @import { JsonDocumentNode } from "./jsonast.js"
 * @import * as API from "./rejson-stringify.d.ts"
 */


/** @type API.rejsonStringify */
export function rejsonStringify(options) {
  this.compiler = (tree) => {
    return toJson(/** @type JsonDocumentNode */ (tree).children[0], options?.replacer, options?.space) + "\n";
  };
}
