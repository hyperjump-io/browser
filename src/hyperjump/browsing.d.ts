import type { JsonNode } from "../json/jsonast.d.ts";
import type { JrefNode } from "../jref/jref-ast.d.ts";
import type { Session } from "./hyperjump.d.ts";

/**
 * A node that isn't a reference. {@link Session.get} and the `jref*`
 * functions follow every reference they reach, so the nodes they return are
 * these, and the `jref*` functions only take these. A node from the `json*`
 * functions can be a reference, so it isn't one until it's narrowed.
 */
export type FollowedNode<T = JrefNode> = Exclude<T, { type: "reference" }>;

/**
 * The property `key` of an object or the item at index `key` of an array,
 * following a reference if it's one.
 *
 * @throws A {@link JsonPointerError} if the property or item doesn't exist.
 */
export const jrefStep: <T extends JsonNode<{ type: string }>>(session: Session<T>, key: string, node: FollowedNode<T>) => Promise<FollowedNode<T>>;

/** Iterate over the items of an array, following the ones that are references. */
export const jrefArrayIter: <T extends JsonNode<{ type: string }>>(session: Session<T>, node: FollowedNode<T>) => AsyncGenerator<FollowedNode<T>, void, unknown>;

/** Iterate over the property values of an object, following the ones that are references. */
export const jrefObjectValues: <T extends JsonNode<{ type: string }>>(session: Session<T>, node: FollowedNode<T>) => AsyncGenerator<FollowedNode<T>, void, unknown>;

/**
 * Iterate over the `[name, node]` pairs of an object, following the values
 * that are references.
 */
export const jrefObjectEntries: <T extends JsonNode<{ type: string }>>(session: Session<T>, node: FollowedNode<T>) => AsyncGenerator<[string, FollowedNode<T>], void, unknown>;

/**
 * Whether an object has a property. It's `jsonObjectHas`, typed to take a
 * node that isn't a reference.
 */
export const jrefObjectHas: <N extends JsonNode<{ type: string }>>(key: string, node: FollowedNode<N>) => boolean;

/**
 * Iterate over the property names of an object. It's `jsonObjectKeys`, typed
 * to take a node that isn't a reference.
 */
export const jrefObjectKeys: <N extends JsonNode<{ type: string }>>(node: FollowedNode<N>) => Generator<string, void, unknown>;

/**
 * The value of a string, number, boolean, or null node as JavaScript.
 *
 * @throws Error for an array or object. Getting their value would need to
 * follow the references in them.
 */
export const jrefValue: {
  <N extends JsonNode<{ type: string }>>(node: FollowedNode<N> & { jsonType: "null" }): null;
  <N extends JsonNode<{ type: string }>>(node: FollowedNode<N> & { jsonType: "boolean" }): boolean;
  <N extends JsonNode<{ type: string }>>(node: FollowedNode<N> & { jsonType: "number" }): number;
  <N extends JsonNode<{ type: string }>>(node: FollowedNode<N> & { jsonType: "string" }): string;
  <N extends JsonNode<{ type: string }>>(node: FollowedNode<N>): string | number | boolean | null;
};
