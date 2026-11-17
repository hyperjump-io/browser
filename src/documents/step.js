import { pipe } from "@hyperjump/pact";
import { filter, map } from "@hyperjump/pact/async";
import { missingValueError, startOf } from "./start.js";
import { follow, isManual } from "./walk.js";
import { relativeFileUrl } from "../file-urls.js";
import { codedError } from "../json/coded-error.js";
import { jsonObjectHas, jsonObjectKeys, jsonStep, jsonValue } from "../json/jsonast-util.js";
import { appendToLocation } from "../json/location.js";

/**
 * @import * as API from "./step.d.ts"
 * @import { DocumentSession, Target } from "./documents.d.ts"
 * @import { DocumentNode } from "../media-types/media-types.d.ts"
 * @import { Walked, WalkedTarget } from "./walk.js"
 */

/**
 * What the step functions take: a target, or a document for its root
 *
 * @typedef {Target | DocumentNode} From
 */

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefStep = /** @type typeof API.jrefStep */ (async (
  /** @type DocumentSession */ session,
  /** @type string */ key,
  /** @type From */ from,
  /** @type API.StepOptions | undefined */ options
) => {
  const target = startOf(from);
  const node = /** @type Walked */ (target.node);
  // A document's root can be a value that couldn't be parsed, which
  // `jsonStep` doesn't take. It's the error `jsonPointerGet` has for a
  // pointer that goes into one.
  const unparsed = unparsedKind(node);
  if (unparsed !== undefined) {
    throw codedError(`Can't index into ${unparsed} value at ${relativeFileUrl(node.location)}`, { code: "ERR_POINTER_NOT_INDEXABLE" }, node.location);
  }
  const member = jsonStep(key, node);
  // A value that's missing from a parse that failed isn't a member
  if (member === undefined) {
    throw missingValueError(appendToLocation(key, node.location));
  }
  return follow(session, target, member, isManual(options));
});

/**
 * What to call a node that's in place of a value that couldn't be parsed,
 * which only the root of a document whose parse failed can be here
 *
 * @type (node: { type: string }) => "a missing" | "an invalid" | undefined
 */
const unparsedKind = (node) => {
  switch (node.type) {
    case "json-missing":
      return "a missing";
    case "json-invalid":
      return "an invalid";
    default:
      return undefined;
  }
};

/**
 * The members of a target's node as targets, each followed when it's
 * reached. The iterators are pact's and not generators, which are slower.
 * Only a reference is waited for.
 *
 * `children` are the node's children, an array's items or an object's
 * properties. A value that's missing from a parse that failed isn't a
 * member.
 *
 * @type <T>(session: DocumentSession, target: Target, children: readonly any[], isObject: boolean, manual: boolean, value: (key: string, member: WalkedTarget) => T) => AsyncIteratorObject<T, undefined, unknown>
 */
const members = (session, target, children, isObject, manual, value) => {
  /** @type (child: any, index: number) => any */
  const member = (child, index) => {
    const key = isObject ? child.children[0].value : `${index}`;
    const followed = follow(session, target, isObject ? child.children[1] : child, manual);
    return followed instanceof Promise ? followed.then((found) => value(key, found)) : value(key, followed);
  };

  // Only a parse that failed has a missing value, so they're only looked
  // for if there is one, which keeps the pipeline to one step. An item's
  // key is its index among all the items, so they're left out after.
  return children.some(isObject ? missingValue : missing)
    ? pipe(children, map((child, index) => (isObject ? missingValue : missing)(child) ? absent : member(child, index)), filter(present))
    : pipe(children, map(member));
};

const absent = Symbol("absent");

/**
 * @template T
 * @param {T | typeof absent} member
 * @returns {member is T}
 */
const present = (member) => member !== absent;

/** @type (itemNode: any) => boolean */
const missing = (itemNode) => itemNode.type === "json-missing";

/** @type (propertyNode: any) => boolean */
const missingValue = (propertyNode) => propertyNode.children[1].type === "json-missing";

/** @type (key: string, member: WalkedTarget) => WalkedTarget */
const memberOnly = (_key, member) => member;

/** @type (key: string, member: WalkedTarget) => [string, WalkedTarget] */
const withKey = (key, member) => [key, member];

/** @type (target: Target, jsonType: "array" | "object") => readonly unknown[] */
const childrenOf = (target, jsonType) => {
  const node = /** @type Walked */ (target.node);
  return node.jsonType === jsonType ? node.children : [];
};

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefArrayIter = /** @type typeof API.jrefArrayIter */ ((
  /** @type DocumentSession */ session,
  /** @type From */ from,
  /** @type API.StepOptions | undefined */ options
) => {
  const target = startOf(from);
  return /** @type any */ (members(session, target, childrenOf(target, "array"), false, isManual(options), memberOnly));
});

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefObjectValues = /** @type typeof API.jrefObjectValues */ ((
  /** @type DocumentSession */ session,
  /** @type From */ from,
  /** @type API.StepOptions | undefined */ options
) => {
  const target = startOf(from);
  return /** @type any */ (members(session, target, childrenOf(target, "object"), true, isManual(options), memberOnly));
});

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefObjectEntries = /** @type typeof API.jrefObjectEntries */ ((
  /** @type DocumentSession */ session,
  /** @type From */ from,
  /** @type API.StepOptions | undefined */ options
) => {
  const target = startOf(from);
  return /** @type any */ (members(session, target, childrenOf(target, "object"), true, isManual(options), withKey));
});

/** @type typeof API.jrefObjectHas */
export const jrefObjectHas = (key, from) => jsonObjectHas(key, /** @type Walked */ (startOf(from).node));

/** @type typeof API.jrefObjectKeys */
export const jrefObjectKeys = (from) => jsonObjectKeys(/** @type Walked */ (startOf(from).node));

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefValue = /** @type typeof API.jrefValue */ ((/** @type From */ from) => {
  const node = /** @type Walked */ (startOf(from).node);
  // A document's root can be a value that couldn't be parsed. A missing
  // one isn't there, as it isn't for `browse`, and an invalid one has no
  // value to give, as it has no JSON for `toJson`.
  if (node.type === "json-missing") {
    throw missingValueError(node.location);
  }
  if (node.type === "json-invalid") {
    throw codedError(`Can't get the value of an invalid value: '${/** @type {{ raw: string }} */ (/** @type unknown */ (node)).raw}' at ${relativeFileUrl(node.location)}`, { code: "ERR_INVALID_VALUE" }, node.location);
  }
  if (node.jsonType === "object" || node.jsonType === "array") {
    throw codedError(`Can't get the value of an ${node.jsonType} at ${relativeFileUrl(node.location)}. Step into it instead.`, { code: "ERR_STRUCTURED_VALUE" }, node.location);
  }

  return jsonValue(node);
});
