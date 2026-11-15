import { follow, maxDepth, maxDepthError, memberEntries } from "./walk.js";

/**
 * @import * as API from "./visit.d.ts"
 * @import { DocumentSession } from "./documents.d.ts"
 * @import { Walked } from "./walk.js"
 */

/** @type typeof API.CONTINUE */
export const CONTINUE = true;
/** @type typeof API.SKIP */
export const SKIP = "skip";
/** @type typeof API.EXIT */
export const EXIT = false;

// The overloads type the function, and the visitor is the third argument,
// or the fourth after a test, with the options after it, so they're read by
// what they are
// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefVisit = /** @type typeof API.jrefVisit */ (
  /**
   * @param {DocumentSession} session
   * @param {Walked} node
   * @param {API.JrefTest<any> | API.JrefVisitor<any>} testOrVisitor
   * @param {API.JrefVisitor<any> | API.WalkOptions} [visitorOrOptions]
   * @param {API.WalkOptions} [options]
   */
  async (session, node, testOrVisitor, visitorOrOptions, options) => {
    const [check, visit, walkOptions] = typeof visitorOrOptions === "function"
      ? [convertTest(/** @type API.JrefTest<any> */ (testOrVisitor)), visitorOrOptions, options]
      : [() => true, /** @type API.JrefVisitor<any> */ (testOrVisitor), visitorOrOptions];

    const walk = { session, maxDepth: maxDepth(walkOptions), ancestors: new Set(), check, visitor: visit };
    // A walk that starts at a reference starts at what it leads to, like a
    // walk that reaches one
    await visitNode(walk, await follow(session, node), undefined, undefined, 0);
  }
);

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefFind = /** @type typeof API.jrefFind */ (async (
  /** @type DocumentSession */ session,
  /** @type Walked */ node,
  /** @type API.JrefTest<any> */ test,
  /** @type API.WalkOptions | undefined */ options
) => {
  /** @type Walked | undefined */
  let found;
  await jrefVisit(session, node, test, (foundNode) => {
    found = /** @type Walked */ (foundNode);
    return EXIT;
  }, options);

  return found;
});

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefFindAll = /** @type typeof API.jrefFindAll */ (async (
  /** @type DocumentSession */ session,
  /** @type Walked */ node,
  /** @type API.JrefTest<any> */ test,
  /** @type API.WalkOptions | undefined */ options
) => {
  // A node reached through more than one reference is found once
  /** @type Set<Walked> */
  const found = new Set();
  await jrefVisit(session, node, test, (foundNode) => {
    found.add(/** @type Walked */ (foundNode));
  }, options);

  return [...found];
});

/**
 * @typedef {(node: Walked, key: string | undefined, parent: Walked | undefined) => boolean} Check
 */

/**
 * What stays the same for every node of a visit. `ancestors` is the nodes
 * being visited, so a reference back to one of them is visited but not
 * descended into. They're the nodes and not their locations, because two
 * documents can say they have the same URL.
 *
 * @typedef {{
 *   session: DocumentSession;
 *   maxDepth: number;
 *   ancestors: Set<Walked>;
 *   check: Check;
 *   visitor: API.JrefVisitor<any>;
 * }} Visit
 */

/**
 * Visit a node, then its members in document order, following each one
 * just before it's visited, so a skipped node's references aren't
 * followed. Going under a node at `maxDepth` throws.
 *
 * @type (walk: Visit, node: Walked, key: string | undefined, parent: Walked | undefined, depth: number) => Promise<API.VisitAction>
 */
const visitNode = async (walk, node, key, parent, depth) => {
  const action = walk.check(node, key, parent) ? await walk.visitor(node, key, parent, depth) : CONTINUE;
  if (action === EXIT) {
    return EXIT;
  }

  if (action === SKIP || walk.ancestors.has(node)) {
    return CONTINUE;
  }

  walk.ancestors.add(node);
  try {
    for (const [memberKey, memberNode] of memberEntries(node)) {
      // It's checked before a member is followed, so a walk that's too deep
      // doesn't retrieve anything under the limit
      if (depth >= walk.maxDepth) {
        throw maxDepthError(walk.maxDepth, node.location);
      }

      const followedNode = /** @type Walked */ (await follow(walk.session, memberNode));
      if (await visitNode(walk, followedNode, memberKey, node, depth + 1) === EXIT) {
        return EXIT;
      }
    }
  } finally {
    walk.ancestors.delete(node);
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
