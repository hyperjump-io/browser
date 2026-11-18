import { nextTask } from "#next-task";
import { browse } from "./documents.js";
import { relativeFileUrl } from "../file-urls.js";
import { codedError } from "../json/coded-error.js";
import { MAX_DEPTH } from "../json/json-parser.js";
import { jsonArrayIter, jsonObjectEntries } from "../json/jsonast-util.js";

/**
 * @import { WalkOptions } from "./visit.d.ts"
 * @import { DocumentSession, FollowedNode, Target } from "./documents.d.ts"
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
 * A target a walk reaches: a node it can walk, with its document
 *
 * @typedef {Target<unknown, Walked>} WalkedTarget
 */

/**
 * The target of a node in a target's document. A reference's is what it
 * leads to, which `browse` finds from the document the reference is in, and
 * follows to a value. Any other node is in the same document. It uses
 * `browse`, so the `jref*` functions are built on a session the way an
 * application's would be.
 *
 * The functions take the type of the target they're given, whose node can
 * be any tree's, so here a node is only what a reference needs. What comes
 * back is typed by the functions.
 *
 * Only a reference is waited for. A walk follows every member, and most
 * aren't references, so they don't each cost a promise. With `manual`, a
 * reference isn't followed, so it's the target of the node as it's
 * written.
 *
 * @type (session: DocumentSession, from: Target, node: unknown, manual?: boolean) => WalkedTarget | Promise<WalkedTarget>
 */
export const follow = (session, from, node, manual = false) => {
  const reference = /** @type JrefNode */ (node);
  if (!manual && reference.type === "reference") {
    return /** @type Promise<WalkedTarget> */ (browse(session, reference.href, { referencedFrom: from }));
  }

  // The target a walk starts at is the one that was given. Any other node
  // is in the same document, so its target has that document.
  return /** @type WalkedTarget */ (node === from.node ? from : { document: from.document, node });
};

/**
 * How many nodes a walk goes through before it lets other tasks run
 */
const STEPS_PER_TASK = 1000;

/**
 * What a walk keeps to stop when it's aborted: its `signal`, and how many
 * nodes it's gone through
 *
 * @typedef {{ signal: AbortSignal | undefined; steps: number }} Pace
 */

/**
 * Throw the walk's signal's reason if it's aborted, and every so many nodes,
 * wait for the next task. A walk of documents the session has waits only
 * for promises that are settled, so without it, nothing else would run
 * until the walk ended, not even what would abort it, like a timer or a
 * request to cancel.
 *
 * @type (walk: Pace) => Promise<void> | undefined
 */
export const pace = (walk) => {
  walk.signal?.throwIfAborted();
  if (++walk.steps % STEPS_PER_TASK !== 0) {
    return;
  }

  return nextTask().then(() => walk.signal?.throwIfAborted());
};

/**
 * Whether a walk's or a step's options say not to follow references
 *
 * @type (options: { reference?: "follow" | "manual" } | undefined) => boolean
 */
export const isManual = (options) => options?.reference === "manual";

/**
 * The members of an array or an object with their keys, like `[key=...]`
 * matches them: an item's index or a property's name. A value that's missing
 * from a parse that failed isn't a member.
 *
 * @type (node: Walked) => [string, NonNullable<JsonMemberValue<Walked>>][]
 */
export const memberEntries = (node) => {
  /** @type [string, NonNullable<JsonMemberValue<Walked>>][] */
  const entries = [];
  if (node.jsonType === "array") {
    let index = 0;
    for (const itemNode of jsonArrayIter(node)) {
      const key = `${index++}`;
      if (itemNode !== undefined) {
        entries.push([key, itemNode]);
      }
    }
  } else if (node.jsonType === "object") {
    for (const [key, valueNode] of jsonObjectEntries(node)) {
      if (valueNode !== undefined) {
        entries.push([key, valueNode]);
      }
    }
  }

  return entries;
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
 * A walk that follows references was asked to find them. Every reference
 * it reaches is followed, and so is the one it starts at, so no node it
 * reaches is one, and what it was asked for can't be found. It's a mistake
 * in the call, so it's a `TypeError`, before anything is retrieved.
 *
 * @type (what: string) => TypeError
 */
export const unreachableReferenceError = (what) => TypeError(
  `A walk that follows references never reaches one, so ${what} can't match anything. To find references, pass reference: "manual".`
);

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
