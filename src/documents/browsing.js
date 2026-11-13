import { get } from "./documents.js";
import { relativeFileUrl } from "../file-urls.js";
import { codedError } from "../json/coded-error.js";
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
    throw codedError(`Can't get the value of an ${node.jsonType} at ${relativeFileUrl(node.location)}. Step into it instead.`, { code: "ERR_STRUCTURED_VALUE" }, node.location);
  }

  return /** @type never */ (jsonValue(node));
};

/**
 * A reference's value, or the node if it isn't a reference. It uses `get`,
 * so these functions are built on a session the way an application's would
 * be. `get` follows a reference to another reference too, and finds the
 * document the reference is in from the node.
 *
 * The functions take the type of the node they're given, which can be any
 * tree's, so here a node is only what a reference needs. What comes back is
 * a node of that tree, which the functions' types say.
 *
 * @type (session: DocumentSession, node: unknown) => Promise<any>
 */
const follow = async (session, node) => {
  const reference = /** @type JrefNode */ (node);
  return reference.type === "reference" ? get(session, reference.href, { referencedFrom: reference }) : node;
};
