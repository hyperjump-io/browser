import { documentUriOf } from "./uri-parts.js";
import { jsonArrayIter, jsonObjectEntries, jsonObjectHas, jsonObjectKeys, jsonObjectValues, jsonStep, jsonValue } from "../json/jsonast-util.js";

/**
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { Session } from "./hyperjump.js"
 * @import * as API from "./browsing.d.ts"
 * @import { FollowedNode } from "./browsing.d.ts"
 * @import { JsonNode } from "../json/jsonast.d.ts"
 * @import { JsonMemberValue } from "../json/jsonast-util.d.ts"
 */

/** @type typeof API.jrefStep */
export const jrefStep = async (session, key, node) => {
  return follow(session, jsonStep(key, node));
};

/** @type typeof API.jrefArrayIter */
export const jrefArrayIter = async function* (session, node) {
  for (const itemNode of jsonArrayIter(node)) {
    yield follow(session, itemNode);
  }
};

/** @type typeof API.jrefObjectValues */
export const jrefObjectValues = async function* (session, node) {
  for (const valueNode of jsonObjectValues(node)) {
    yield follow(session, valueNode);
  }
};

/** @type typeof API.jrefObjectEntries */
export const jrefObjectEntries = async function* (session, node) {
  for (const [key, valueNode] of jsonObjectEntries(node)) {
    yield [key, await follow(session, valueNode)];
  }
};

// The same functions as the JSON ones, typed to take a node that isn't a
// reference
/** @type typeof API.jrefObjectHas */
export const jrefObjectHas = jsonObjectHas;
/** @type typeof API.jrefObjectKeys */
export const jrefObjectKeys = jsonObjectKeys;

/** @type typeof API.jrefValue */
export const jrefValue = (node) => {
  if (node.jsonType === "object" || node.jsonType === "array") {
    throw Error("Can't get the value of a structured value.");
  }

  return /** @type never */ (jsonValue(node));
};

/**
 * A reference's value, or the node if it isn't a reference. It uses the
 * session's public `get`, so these functions are built on a session the way
 * an application's would be. `get` follows a reference to another reference
 * too.
 *
 * @template {JsonNode<{ type: string }>} T
 * @param {Session<T>} session
 * @param {JsonMemberValue<FollowedNode<T>>} node
 * @returns {Promise<FollowedNode<T>>}
 */
const follow = async (session, node) => {
  const jrefNode = /** @type JrefNode */ (node);
  if (jrefNode.type === "reference") {
    return session.get(jrefNode.href, { referencedFrom: documentUriOf(jrefNode.location) });
  } else {
    return /** @type FollowedNode<T> */ (node);
  }
};
