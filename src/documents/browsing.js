import { follow, memberEntries } from "./walk.js";
import { relativeFileUrl } from "../file-urls.js";
import { codedError } from "../json/coded-error.js";
import { jsonArrayIter, jsonObjectEntries, jsonObjectHas, jsonObjectKeys, jsonObjectValues, jsonStep, jsonValue } from "../json/jsonast-util.js";

/**
 * @import * as API from "./browsing.d.ts"
 * @import { DocumentSession, FollowedNode } from "./documents.d.ts"
 * @import { Walked } from "./walk.js"
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

/** @type typeof API.CONTINUE */
export const CONTINUE = true;
/** @type typeof API.SKIP */
export const SKIP = "skip";
/** @type typeof API.EXIT */
export const EXIT = false;

// The overloads type the function, and the visitor is the third argument,
// or the fourth after a test, so they're read by what they are
// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefVisit = /** @type typeof API.jrefVisit */ (
  /**
   * @param {DocumentSession} session
   * @param {Walked} node
   * @param {API.JrefTest<any> | API.JrefVisitor<any>} testOrVisitor
   * @param {API.JrefVisitor<any>} [visitor]
   */
  async (session, node, testOrVisitor, visitor) => {
    const [check, visit] = visitor === undefined
      ? [() => true, /** @type API.JrefVisitor<any> */ (testOrVisitor)]
      : [convertTest(/** @type API.JrefTest<any> */ (testOrVisitor)), visitor];

    await visitNode(session, node, undefined, undefined, 0, new Set(), check, visit);
  }
);

/**
 * @typedef {(node: Walked, key: string | undefined, parent: Walked | undefined) => boolean} Check
 */

/**
 * Visit a node, then its members in document order, following each one
 * just before it's visited, so a skipped node's references aren't
 * followed. `ancestors` is the nodes being visited above it, so a
 * reference back to one of them is visited but not descended into. They're
 * the nodes and not their locations, because two documents can say they
 * have the same URL.
 *
 * @type (session: DocumentSession, node: Walked, key: string | undefined, parent: Walked | undefined, depth: number, ancestors: Set<Walked>, check: Check, visitor: API.JrefVisitor<any>) => Promise<API.VisitAction>
 */
const visitNode = async (session, node, key, parent, depth, ancestors, check, visitor) => {
  const action = check(node, key, parent) ? await visitor(node, key, parent, depth) : CONTINUE;
  if (action === EXIT) {
    return EXIT;
  }

  if (action === SKIP || ancestors.has(node)) {
    return CONTINUE;
  }

  ancestors.add(node);
  try {
    for (const [memberKey, memberNode] of memberEntries(node)) {
      const followedNode = /** @type Walked */ (await follow(session, memberNode));
      if (await visitNode(session, followedNode, memberKey, node, depth + 1, ancestors, check, visitor) === EXIT) {
        return EXIT;
      }
    }
  } finally {
    ancestors.delete(node);
  }

  return CONTINUE;
};

/**
 * A test as a function, the way `unist-util-is` converts one: `null` or
 * `undefined` passes every node, a string is a `type`, an object is
 * properties that have to be equal, and an array is tests any one of which
 * passes. An array's tests can't be arrays, as `unist-util-is`'s types say.
 *
 * @type (test: API.JrefTest<any>) => Check
 */
const convertTest = (test) => {
  if (test === null || test === undefined) {
    return () => true;
  } else if (Array.isArray(test)) {
    const checks = test.map((check) => {
      if (Array.isArray(check) || check === null || check === undefined) {
        throw TypeError("An array's tests have to be strings, objects, or functions");
      }
      return convertCheck(check);
    });
    return (node, key, parent) => checks.some((check) => check(node, key, parent));
  } else {
    return convertCheck(/** @type API.JrefCheck<any> */ (test));
  }
};

/** @type (check: API.JrefCheck<any>) => Check */
const convertCheck = (check) => {
  if (typeof check === "string") {
    return (node) => node.type === check;
  } else if (typeof check === "function") {
    return (node, key, parent) => Boolean(check(node, key, parent));
  } else if (typeof check === "object" && check !== null) {
    const entries = Object.entries(check);
    return (node) => entries.every(([name, value]) => /** @type Record<string, unknown> */ (node)[name] === value);
  } else {
    throw TypeError("A test has to be null, a string, an object, a function, or an array of tests");
  }
};
