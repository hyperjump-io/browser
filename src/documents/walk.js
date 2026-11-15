import { get } from "./documents.js";
import { relativeFileUrl } from "../file-urls.js";
import { codedError } from "../json/coded-error.js";
import { MAX_DEPTH } from "../json/json-parser.js";
import { jsonArrayIter, jsonObjectEntries } from "../json/jsonast-util.js";

/**
 * @import { WalkOptions } from "./browsing.d.ts"
 * @import { DocumentSession, FollowedNode } from "./documents.d.ts"
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { JsonNode } from "../json/jsonast.d.ts"
 * @import { JsonMemberValue } from "../json/jsonast-util.d.ts"
 */

/**
 * A node a walk reaches. A walk takes any tree's nodes, so here a node is
 * what it needs to walk one.
 *
 * @typedef {FollowedNode<JsonNode<{ type: string }>>} Walked
 */

/**
 * A reference's value, or the node if it isn't a reference. It uses `get`,
 * so the browsing functions are built on a session the way an
 * application's would be. `get` follows a reference to another reference
 * too, and finds the document the reference is in from the node.
 *
 * The functions take the type of the node they're given, which can be any
 * tree's, so here a node is only what a reference needs. What comes back is
 * a node of that tree, which the functions' types say.
 *
 * @type (session: DocumentSession, node: unknown) => Promise<any>
 */
export const follow = async (session, node) => {
  const reference = /** @type JrefNode */ (node);
  return reference.type === "reference" ? get(session, reference.href, { referencedFrom: reference }) : node;
};

/**
 * The members of an array or an object with their keys, like `[key=...]`
 * matches them: an item's index or a property's name. A value that's missing
 * from a parse that failed isn't a member.
 *
 * @param {Walked} node
 * @yields {[string, JsonMemberValue<Walked>]}
 * @returns {Generator<[string, JsonMemberValue<Walked>]>}
 */
export const memberEntries = function* (node) {
  if (node.jsonType === "array") {
    let index = 0;
    for (const itemNode of jsonArrayIter(node)) {
      const key = `${index++}`;
      if (itemNode !== undefined) {
        yield [key, itemNode];
      }
    }
  } else if (node.jsonType === "object") {
    for (const [key, valueNode] of jsonObjectEntries(node)) {
      if (valueNode !== undefined) {
        yield [key, valueNode];
      }
    }
  }
};

/**
 * The `maxDepth` of a walk's options, or the default, which is how deep a
 * parsed document can nest
 *
 * @type (options: WalkOptions | undefined) => number
 */
export const maxDepth = (options) => {
  const depth = options?.maxDepth ?? MAX_DEPTH;
  if (depth !== Infinity && (!Number.isInteger(depth) || depth < 0)) {
    throw RangeError(`'maxDepth' has to be a whole number that isn't negative, or Infinity, not ${depth}`);
  }

  return depth;
};

/**
 * A walk would go under a node at its `maxDepth`
 *
 * @type (maxDepth: number, location: string) => Error
 */
export const maxDepthError = (maxDepth, location) => codedError(
  `Walking more than ${maxDepth} levels deep, under ${relativeFileUrl(location)}. If that's expected, use a bigger 'maxDepth', or Infinity.`,
  { code: "ERR_MAX_DEPTH", maxDepth },
  location
);
