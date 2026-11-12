import { get } from "./documents.js";
import { jsonArrayIter, jsonObjectEntries, jsonObjectHas, jsonObjectKeys, jsonObjectValues, jsonStep, jsonValue } from "../json/jsonast-util.js";

/**
 * @import * as API from "./browsing.d.ts"
 * @import { DocumentSession, FollowedNode } from "./documents.d.ts"
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 */

/** @type typeof API.jrefStep */
export const jrefStep = async (session, key, node) => follow(session, jsonStep(key, node));

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
export const jrefValue = (/** @type FollowedNode */ node) => {
  if (node.jsonType === "object" || node.jsonType === "array") {
    throw Error("Can't get the value of a structured value.");
  }

  return /** @type never */ (jsonValue(node));
};

/**
 * A reference's value, or the node if it isn't a reference. It uses `get`,
 * so these functions are built on a session the way an application's would
 * be. `get` follows a reference to another reference too, and finds the
 * document the reference is in from the node.
 *
 * @type (session: DocumentSession, node: JrefNode) => Promise<FollowedNode>
 */
const follow = async (session, node) => node.type === "reference"
  ? get(session, node.href, { referencedFrom: node })
  : node;
