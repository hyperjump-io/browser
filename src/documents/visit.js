import { hasValue, startOf } from "./start.js";
import { follow, isManual, limit, maxDepth, maxDepthError, memberEntries, pace, unreachableReferenceError } from "./walk.js";
import { relativeFileUrl } from "../file-urls.js";
import { codedError } from "../json/coded-error.js";

/**
 * @import * as API from "./visit.d.ts"
 * @import { DocumentSession } from "./documents.d.ts"
 * @import { Target } from "./documents.d.ts"
 * @import { DocumentNode } from "../media-types/media-types.d.ts"
 * @import { Pace, Walked, WalkedTarget } from "./walk.js"
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
   * @param {API.JrefVisitor<any> | API.VisitOptions} [visitorOrOptions]
   * @param {API.VisitOptions} [options]
   */
  (session, from, testOrVisitor, visitorOrOptions, options) => visitFrom(session, from, testOrVisitor, visitorOrOptions, options, undefined)
);

/**
 * The default `maxRevisits`: how many times a visit can go back under the
 * same node, or more if it's reached a tenth that many nodes
 */
const MAX_REVISITS = 10_000;

/**
 * How many times a visit can go back under the same node for each node
 * it's reached. Going back under a node more times than there are nodes
 * takes sharing that's nested, which correct documents have too, like a
 * grammar whose definitions refer to each other. The most measured in a
 * real schema is 1.5, and a document that doubles at each level is past
 * any multiple within a few levels (see `design/benchmarks/revisits.md`).
 */
const REVISITS_PER_NODE = 10;

/**
 * `jrefVisit`, with the nodes that have been walked under for a walk that
 * finds (`walked` in `Visit`)
 *
 * @type (session: DocumentSession, from: Target | DocumentNode, testOrVisitor: API.JrefTest<any> | API.JrefVisitor<any>, visitorOrOptions: API.JrefVisitor<any> | API.VisitOptions | undefined, options: API.VisitOptions | undefined, walked: Set<Walked> | undefined) => Promise<void>
 */
const visitFrom = async (session, from, testOrVisitor, visitorOrOptions, options, walked) => {
  const [check, visit, walkOptions] = typeof visitorOrOptions === "function"
    ? [convertTest(/** @type API.JrefTest<any> */ (testOrVisitor)), visitorOrOptions, options]
    : [() => true, /** @type API.JrefVisitor<any> */ (testOrVisitor), /** @type API.VisitOptions | undefined */ (visitorOrOptions)];

  const manual = isManual(walkOptions);
  if (!manual && typeof visitorOrOptions === "function" && onlyReferences(/** @type API.JrefTest<any> */ (testOrVisitor))) {
    throw unreachableReferenceError("a test that only passes a reference");
  }
  const maxRevisits = limit("maxRevisits", walkOptions?.maxRevisits ?? MAX_REVISITS);
  // A walk that finds goes under a node once, and one that doesn't follow
  // references walks a tree, which has each node once
  const revisits = walked || manual || maxRevisits === Infinity
    ? undefined
    : { max: maxRevisits, reached: new Set(), times: new Map() };
  const walk = { session, maxDepth: maxDepth(walkOptions), manual, ancestors: new Set(), walked, revisits, check, visitor: visit, signal: walkOptions?.signal, steps: 0 };
  // A walk that's aborted already doesn't retrieve the target it starts at
  walk.signal?.throwIfAborted();
  // A walk that starts at a reference starts at what it leads to, like a
  // walk that reaches one
  const target = startOf(from);
  // A document with nothing in it has nothing to visit
  if (!hasValue(target)) {
    return;
  }
  await visitTarget(walk, await follow(session, target, target.node, manual), undefined, undefined, 0);
};

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefFind = /** @type typeof API.jrefFind */ (async (
  /** @type DocumentSession */ session,
  /** @type Target | DocumentNode */ target,
  /** @type API.JrefTest<any> */ test,
  /** @type API.WalkOptions | undefined */ options
) => {
  /** @type WalkedTarget | undefined */
  let found;
  await visitFrom(session, target, test, (foundTarget) => {
    found = /** @type WalkedTarget */ (foundTarget);
    return EXIT;
  }, options, new Set());

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
  await visitFrom(session, target, test, (/** @type WalkedTarget */ foundTarget) => {
    if (!found.has(foundTarget.node)) {
      found.set(foundTarget.node, foundTarget);
    }
  }, options, new Set());

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
 * `walked` is the nodes that everything under has been walked, for a walk
 * that finds. A node that's reached again is tested with its key and
 * parent, but what's under it isn't walked again. It would be tested with
 * the same keys and parents and find what was found, and a document that
 * refers to each level twice from the one above would take twice as long
 * for each level. A visit doesn't have it, because it visits a value each
 * place it is.
 *
 * `revisits` is for a visit that follows references, which can go under a
 * node more than once (see `Revisits`).
 *
 * @typedef {{
 *   session: DocumentSession;
 *   maxDepth: number;
 *   manual: boolean;
 *   ancestors: Set<Walked>;
 *   walked: Set<Walked> | undefined;
 *   revisits: Revisits | undefined;
 *   check: Check;
 *   visitor: API.JrefVisitor<any>;
 * } & Pace} Visit
 */

/**
 * What a visit keeps for `maxRevisits`: how many times it's gone back under
 * each node, and every node it's reached, with the references it followed.
 * A value that's used in many places is gone under once for each reference
 * to it, and each of those references is reached first, so going back
 * under a node many times more than the nodes the visit has reached takes
 * values that are used in values that are used, many times over. A
 * document that refers to each level twice from the one above does that
 * within a few levels.
 *
 * @typedef {{ max: number; reached: Set<unknown>; times: Map<Walked, number> }} Revisits
 */

/**
 * Visit a target, then its node's members in document order, following
 * each one just before it's visited, so a skipped node's references aren't
 * followed. Going under a node at `maxDepth` throws.
 *
 * @type (walk: Visit, target: WalkedTarget, key: string | undefined, parent: WalkedTarget | undefined, depth: number) => Promise<API.VisitAction>
 */
const visitTarget = async (walk, target, key, parent, depth) => {
  const paced = pace(walk);
  if (paced) {
    await paced;
  }

  // A visitor that isn't async isn't waited for
  const visited = walk.check(target, key, parent) ? walk.visitor(target, key, parent, depth) : CONTINUE;
  const action = visited instanceof Promise ? await visited : visited;
  if (action === EXIT) {
    return EXIT;
  }

  const { node } = target;
  walk.revisits?.reached.add(node);
  if (action === SKIP || walk.ancestors.has(node) || walk.walked?.has(node)) {
    return CONTINUE;
  }

  const members = memberEntries(node);
  if (walk.revisits && members.length > 0) {
    goUnder(walk.revisits, node);
  }

  walk.ancestors.add(node);
  try {
    for (const [memberKey, memberNode] of members) {
      // It's checked before a member is followed, so a walk that's too deep
      // doesn't retrieve anything under the limit
      if (depth >= walk.maxDepth) {
        throw maxDepthError(walk.maxDepth, node.location);
      }

      walk.revisits?.reached.add(memberNode);
      const followed = follow(walk.session, target, memberNode, walk.manual);
      const member = followed instanceof Promise ? await followed : followed;
      if (await visitTarget(walk, member, memberKey, target, depth + 1) === EXIT) {
        return EXIT;
      }
    }
  } finally {
    walk.ancestors.delete(node);
  }

  walk.walked?.add(node);
  return CONTINUE;
};

/**
 * Count going under a node, which throws if it's gone back under it
 * `maxRevisits` times, and `REVISITS_PER_NODE` times for each node it's
 * reached. It's
 * checked before anything under the node is followed.
 *
 * @type (revisits: Revisits, node: Walked) => void
 */
const goUnder = (revisits, node) => {
  const times = revisits.times.get(node);
  if (times === undefined) {
    revisits.times.set(node, 0);
    return;
  }

  if (times >= revisits.max && times >= REVISITS_PER_NODE * revisits.reached.size) {
    throw codedError(
      `Going back under ${relativeFileUrl(node.location)} more than ${times} times, ${REVISITS_PER_NODE} for each of the ${revisits.reached.size} values the visit has reached. A value that's used in values that are used, many times over, makes a visit too big to finish. If that's expected, use a bigger 'maxRevisits', or Infinity.`,
      { code: "ERR_MAX_REVISITS", maxRevisits: revisits.max },
      node.location
    );
  }
  revisits.times.set(node, times + 1);
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
