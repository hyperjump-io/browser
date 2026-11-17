import { relativeFileUrl } from "../file-urls.js";
import { codedError } from "../json/coded-error.js";

/**
 * @import { Target } from "./documents.d.ts"
 * @import { DocumentNode } from "../media-types/media-types.d.ts"
 */

/**
 * The target to start from. A target is itself, and a document is its
 * root's, the way a unist utility takes the tree. A target is told by its
 * `node`, which a document node doesn't have.
 *
 * @type (from: Target | DocumentNode) => Target
 */
export const startOf = (from) => "node" in from ? from : { document: from, node: from.children[0] };

/**
 * What's thrown for a value that's missing from a parse that failed, where
 * a target is asked for. It isn't a value to find, like a property that
 * doesn't exist.
 *
 * @type (location: string) => Error
 */
export const missingValueError = (location) => codedError(`There's no value at ${relativeFileUrl(location)}`, { code: "ERR_POINTER_NOT_FOUND" }, location);

/**
 * Whether there's a value to start a walk at. The root of a document with
 * nothing in it is missing, which isn't a value, as a member that's
 * missing isn't one.
 *
 * @type (target: Target) => boolean
 */
export const hasValue = (target) => /** @type {{ type?: string }} */ (target.node).type !== "json-missing";
