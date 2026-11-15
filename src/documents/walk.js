import { get } from "./documents.js";
import { jsonArrayIter, jsonObjectEntries } from "../json/jsonast-util.js";

/**
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
 * The members of an array or an object with their keys, like `jrefStep`
 * takes them: an item's index or a property's name. A value that's missing
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
