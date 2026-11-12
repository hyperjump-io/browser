import type { JsonPointerError } from "../json/jsonast-util.d.ts";
import type { DocumentSession, FollowedNode } from "./documents.d.ts";

/**
 * The property `key` of an object or the item at index `key` of an array,
 * following a reference if it's one.
 *
 * @throws A {@link JsonPointerError} if the property or item doesn't exist.
 * @throws What `get` throws, if it follows a reference.
 */
export const jrefStep: (session: DocumentSession, key: string, node: FollowedNode) => Promise<FollowedNode>;

/** Iterate over the items of an array, following the ones that are references. */
export const jrefArrayIter: (session: DocumentSession, node: FollowedNode) => AsyncGenerator<FollowedNode, void, unknown>;

/** Iterate over the property values of an object, following the ones that are references. */
export const jrefObjectValues: (session: DocumentSession, node: FollowedNode) => AsyncGenerator<FollowedNode, void, unknown>;

/**
 * Iterate over the `[name, node]` pairs of an object, following the values
 * that are references.
 */
export const jrefObjectEntries: (session: DocumentSession, node: FollowedNode) => AsyncGenerator<[string, FollowedNode], void, unknown>;

/**
 * Whether an object has a property. It's `jsonObjectHas`, typed to take a
 * node that isn't a reference.
 */
export const jrefObjectHas: (key: string, node: FollowedNode) => boolean;

/**
 * Iterate over the property names of an object. It's `jsonObjectKeys`, typed
 * to take a node that isn't a reference.
 */
export const jrefObjectKeys: (node: FollowedNode) => Generator<string, void, unknown>;

/**
 * The value of a string, number, boolean, or null node as JavaScript.
 *
 * @throws Error for an array or object. Getting their value would need to
 * follow the references in them.
 */
export const jrefValue: {
  (node: FollowedNode & { jsonType: "null" }): null;
  (node: FollowedNode & { jsonType: "boolean" }): boolean;
  (node: FollowedNode & { jsonType: "number" }): number;
  (node: FollowedNode & { jsonType: "string" }): string;
  (node: FollowedNode): string | number | boolean | null;
};
