/**
 * @import { Target } from "./documents.d.ts"
 * @import { DocumentNode } from "../media-types/media-types.d.ts"
 */

/**
 * The target to browse from. A target is itself, and a document is its
 * root's, the way a unist utility takes the tree. A target is told by its
 * `node`, which a document node doesn't have.
 *
 * @type (from: Target | DocumentNode) => Target
 */
export const startOf = (from) => "node" in from ? from : { document: from, node: from.children[0] };
