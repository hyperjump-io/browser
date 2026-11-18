import { hasValue, startOf } from "./start.js";
import { follow, isManual, maxDepth, maxDepthError, memberEntries, unreachableReferenceError } from "./walk.js";

/**
 * @import * as API from "./visit.d.ts"
 * @import { DocumentSession } from "./documents.d.ts"
 * @import { Target } from "./documents.d.ts"
 * @import { DocumentNode } from "../media-types/media-types.d.ts"
 * @import { Walked, WalkedTarget } from "./walk.js"
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
   * @param {Target | DocumentNode} from
   * @param {API.JrefTest<any> | API.JrefVisitor<any>} testOrVisitor
   * @param {API.JrefVisitor<any> | API.WalkOptions} [visitorOrOptions]
   * @param {API.WalkOptions} [options]
   */
  async (session, from, testOrVisitor, visitorOrOptions, options) => {
    const [check, visit, walkOptions] = typeof visitorOrOptions === "function"
      ? [convertTest(/** @type API.JrefTest<any> */ (testOrVisitor)), visitorOrOptions, options]
      : [() => true, /** @type API.JrefVisitor<any> */ (testOrVisitor), visitorOrOptions];

    const manual = isManual(walkOptions);
    if (!manual && typeof visitorOrOptions === "function" && onlyReferences(/** @type API.JrefTest<any> */ (testOrVisitor))) {
      throw unreachableReferenceError("a test that only passes a reference");
    }
    const walk = { session, maxDepth: maxDepth(walkOptions), manual, ancestors: new Set(), check, visitor: visit };
    // A walk that starts at a reference starts at what it leads to, like a
    // walk that reaches one
    const target = startOf(from);
    // A document with nothing in it has nothing to visit
    if (!hasValue(target)) {
      return;
    }
    await visitTarget(walk, await follow(session, target, target.node, manual), undefined, undefined, 0);
  }
);

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefFind = /** @type typeof API.jrefFind */ (async (
  /** @type DocumentSession */ session,
  /** @type Target | DocumentNode */ target,
  /** @type API.JrefTest<any> */ test,
  /** @type API.WalkOptions | undefined */ options
) => {
  /** @type WalkedTarget | undefined */
  let found;
  await jrefVisit(session, /** @type never */ (target), test, (foundTarget) => {
    found = /** @type WalkedTarget */ (foundTarget);
    return EXIT;
  }, options);

  return found;
});

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefFindAll = /** @type typeof API.jrefFindAll */ (async (
  /** @type DocumentSession */ session,
  /** @type Target | DocumentNode */ target,
  /** @type API.JrefTest<any> */ test,
  /** @type API.WalkOptions | undefined */ options
) => {
  // A node reached through more than one reference is found once
  /** @type Map<Walked, WalkedTarget> */
  const found = new Map();
  await jrefVisit(session, /** @type never */ (target), test, (/** @type WalkedTarget */ foundTarget) => {
    if (!found.has(foundTarget.node)) {
      found.set(foundTarget.node, foundTarget);
    }
  }, options);

  return [...found.values()];
});

/**
 * @typedef {(target: WalkedTarget, key: string | undefined, parent: WalkedTarget | undefined) => boolean} Check
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
 *   manual: boolean;
 *   ancestors: Set<Walked>;
 *   check: Check;
 *   visitor: API.JrefVisitor<any>;
 * }} Visit
 */

/**
 * Visit a target, then its node's members in document order, following
 * each one just before it's visited, so a skipped node's references aren't
 * followed. Going under a node at `maxDepth` throws.
 *
 * @type (walk: Visit, target: WalkedTarget, key: string | undefined, parent: WalkedTarget | undefined, depth: number) => Promise<API.VisitAction>
 */
const visitTarget = async (walk, target, key, parent, depth) => {
  // A visitor that isn't async isn't waited for
  const visited = walk.check(target, key, parent) ? walk.visitor(target, key, parent, depth) : CONTINUE;
  const action = visited instanceof Promise ? await visited : visited;
  if (action === EXIT) {
    return EXIT;
  }

  const { node } = target;
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

      const followed = follow(walk.session, target, memberNode, walk.manual);
      const member = followed instanceof Promise ? await followed : followed;
      if (await visitTarget(walk, member, memberKey, target, depth + 1) === EXIT) {
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
 * passes. A string and an object are about the target's node, and a
 * function gets the target. An array's tests can't be arrays, as `unist-util-is`'s types say.
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
    return (target, key, parent) => checks.some((check) => check(target, key, parent));
  } else {
    return convertCheck(/** @type API.JrefCheck<any> */ (test));
  }
};

/**
 * Whether a test can only pass a reference: a `"reference"` type, an
 * object whose `type` is `"reference"`, or an array of only those. A
 * function could pass anything, so it isn't one.
 *
 * @type (test: API.JrefTest<any>) => boolean
 */
const onlyReferences = (test) => Array.isArray(test)
  ? test.length > 0 && test.every(onlyReferences)
  : test === "reference" || (typeof test === "object" && test !== null && /** @type {{ type?: unknown }} */ (test).type === "reference");

/** @type (check: API.JrefCheck<any>) => Check */
const convertCheck = (check) => {
  if (typeof check === "string") {
    return ({ node }) => node.type === check;
  } else if (typeof check === "function") {
    return (target, key, parent) => Boolean(check(target, key, parent));
  } else if (typeof check === "object" && check !== null) {
    const entries = Object.entries(check);
    return ({ node }) => entries.every(([name, value]) => /** @type Record<string, unknown> */ (node)[name] === value);
  } else {
    throw TypeError("A test has to be null, a string, an object, a function, or an array of tests");
  }
};
