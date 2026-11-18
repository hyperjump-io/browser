import { pipe } from "@hyperjump/pact";
import { filter, flatMap, map } from "@hyperjump/pact/async";
import { hasValue, missingValueError, startOf } from "./start.js";
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
  const target = await stepStart(session, from, isManual(options));
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
 * The target a step starts at. A reference is followed, the way a walk
 * follows the target it starts at, unless the options say not to. Any
 * other target is the one that was given.
 *
 * @type (session: DocumentSession, from: From, manual: boolean) => WalkedTarget | Promise<WalkedTarget>
 */
const stepStart = (session, from, manual) => {
  const target = startOf(from);
  return manual ? /** @type WalkedTarget */ (target) : follow(session, target, target.node);
};

/**
 * An iterator of what's in the target a step starts at. A start that's a
 * reference is followed when the iterator is first read, as a member is
 * followed when it's reached, and only it is waited for.
 *
 * @type <T>(session: DocumentSession, from: From, options: API.StepOptions | undefined, iterate: (target: WalkedTarget, manual: boolean) => AsyncIteratorObject<T, undefined, unknown>) => AsyncIteratorObject<T, undefined, unknown>
 */
const fromStart = (session, from, options, iterate) => {
  const manual = isManual(options);
  const target = /** @type WalkedTarget */ (startOf(from));
  return manual || /** @type {{ type: string }} */ (target.node).type !== "reference"
    ? iterate(target, manual)
    : /** @type any */ (pipe([target], flatMap(async (/** @type WalkedTarget */ reference) => iterate(await follow(session, reference, reference.node), manual))));
};

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
) => fromStart(session, from, options, (target, manual) => members(session, target, childrenOf(target, "array"), false, manual, memberOnly)));

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefObjectValues = /** @type typeof API.jrefObjectValues */ ((
  /** @type DocumentSession */ session,
  /** @type From */ from,
  /** @type API.StepOptions | undefined */ options
) => fromStart(session, from, options, (target, manual) => members(session, target, childrenOf(target, "object"), true, manual, memberOnly)));

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefObjectEntries = /** @type typeof API.jrefObjectEntries */ ((
  /** @type DocumentSession */ session,
  /** @type From */ from,
  /** @type API.StepOptions | undefined */ options
) => fromStart(session, from, options, (target, manual) => members(session, target, childrenOf(target, "object"), true, manual, withKey)));

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefObjectHas = /** @type typeof API.jrefObjectHas */ (async (
  /** @type DocumentSession */ session,
  /** @type string */ key,
  /** @type From */ from,
  /** @type API.StepOptions | undefined */ options
) => jsonObjectHas(key, /** @type Walked */ ((await stepStart(session, from, isManual(options))).node)));

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefObjectKeys = /** @type typeof API.jrefObjectKeys */ ((
  /** @type DocumentSession */ session,
  /** @type From */ from,
  /** @type API.StepOptions | undefined */ options
) => fromStart(session, from, options, (target) => pipe(jsonObjectKeys(/** @type Walked */ (target.node)), map((/** @type string */ key) => key))));

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefFollow = /** @type typeof API.jrefFollow */ (async (
  /** @type DocumentSession */ session,
  /** @type From */ from
) => {
  const target = startOf(from);
  if (!hasValue(target)) {
    throw missingValueError(/** @type {{ location: string }} */ (target.node).location);
  }
  return follow(session, target, target.node);
});

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefIsReference = /** @type typeof API.jrefIsReference */ ((/** @type Target */ target) => {
  return /** @type {{ type: string }} */ (target.node).type === "reference";
});

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefHref = /** @type typeof API.jrefHref */ ((/** @type Target */ target) => {
  if (!jrefIsReference(target)) {
    throw TypeError(`Only a reference has an href, not the value at ${relativeFileUrl(/** @type {{ location: string }} */ (target.node).location)}`);
  }
  return /** @type {{ href: string }} */ (target.node).href;
});

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefLocation = /** @type typeof API.jrefLocation */ ((/** @type From */ from) => {
  return /** @type {{ location: string }} */ (startOf(from).node).location;
});

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefJsonType = /** @type typeof API.jrefJsonType */ (async (
  /** @type DocumentSession */ session,
  /** @type From */ from,
  /** @type API.StepOptions | undefined */ options
) => parsedNode(await stepStart(session, from, isManual(options)), "type").jsonType);

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefValue = /** @type typeof API.jrefValue */ (async (
  /** @type DocumentSession */ session,
  /** @type From */ from,
  /** @type API.StepOptions | undefined */ options
) => {
  const node = parsedNode(await stepStart(session, from, isManual(options)), "value");
  if (node.jsonType === "object" || node.jsonType === "array") {
    throw codedError(`Can't get the value of an ${node.jsonType} at ${relativeFileUrl(node.location)}. Step into it instead.`, { code: "ERR_STRUCTURED_VALUE" }, node.location);
  }

  return jsonValue(node);
});

/**
 * A target's node, which a document's root can have in place of a value
 * that couldn't be parsed. A missing one isn't there, as it isn't for
 * `browse`, and an invalid one has no type or value to give, as it has no
 * JSON for `toJson`.
 *
 * @type (target: WalkedTarget, what: "type" | "value") => Walked
 */
const parsedNode = (target, what) => {
  const node = /** @type Walked */ (target.node);
  if (node.type === "json-missing") {
    throw missingValueError(node.location);
  }
  if (node.type === "json-invalid") {
    throw codedError(`Can't get the ${what} of an invalid value: '${/** @type {{ raw: string }} */ (/** @type unknown */ (node)).raw}' at ${relativeFileUrl(node.location)}`, { code: "ERR_INVALID_VALUE" }, node.location);
  }
  return node;
};
