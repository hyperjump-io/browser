import { toAbsoluteIri } from "@hyperjump/uri";
import { jsonArrayIter, jsonObjectEntries, jsonObjectHas, jsonObjectKeys, jsonObjectValues, jsonStep, jsonValue } from "../json/jsonast-util.js";

/**
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { Session } from "./hyperjump.js"
 * @import * as API from "./browsing.d.ts"
 */

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefStep = /** @type API.jrefStep */ (async (/** @type Session */ session, /** @type string */ key, /** @type JrefNode */ node) => {
  return follow(session, jsonStep(key, node));
});

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefArrayIter = /** @type API.jrefArrayIter */ (async function* (/** @type Session */ session, /** @type JrefNode */ node) {
  for (const itemNode of jsonArrayIter(node)) {
    yield follow(session, itemNode);
  }
});

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefObjectValues = /** @type API.jrefObjectValues */ (async function* (/** @type Session */ session, /** @type JrefNode */ node) {
  for (const valueNode of jsonObjectValues(node)) {
    yield follow(session, valueNode);
  }
});

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefObjectEntries = /** @type API.jrefObjectEntries */ (async function* (/** @type Session */ session, /** @type JrefNode */ node) {
  for (const [key, valueNode] of jsonObjectEntries(node)) {
    yield /** @type [string, JrefNode] */ ([key, await follow(session, valueNode)]);
  }
});

// The same functions as the JSON ones, typed to take a node that isn't a
// reference
export const jrefObjectHas = /** @type API.jrefObjectHas */ (jsonObjectHas);
export const jrefObjectKeys = /** @type API.jrefObjectKeys */ (jsonObjectKeys);

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefValue = /** @type API.jrefValue */ ((/** @type JrefNode */ node) => {
  if (node.jsonType === "object" || node.jsonType === "array") {
    throw Error("Can't get the value of a structured value.");
  }

  return /** @type never */ (jsonValue(node));
});

/**
 * A reference's value, or the node if it isn't a reference. It uses the
 * session's public `get`, so these functions are built on a session the way
 * an application's would be. `get` follows a reference to another reference
 * too.
 *
 * @type (session: Session, node: JrefNode) => Promise<JrefNode>
 */
const follow = async (session, node) => {
  if (node.type === "reference") {
    return session.get(node.href, { referencedFrom: toAbsoluteIri(node.location) });
  } else {
    return node;
  }
};
