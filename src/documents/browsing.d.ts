import type { DocumentSession, FollowedNode, SessionNode } from "./documents.d.ts";
import type { AnyJsonNode, JsonMemberValue } from "../json/jsonast-util.d.ts";

/**
 * A node that isn't a reference, of any tree whose references are
 * `reference` nodes with an `href`, like a JRef tree. A node whose type says
 * it could be a reference has to be followed first.
 */
export type Browsable<N> = [Extract<N, { type: "reference" }>] extends [never] ? N : never;

/**
 * What a value of an object node or an item of an array node is once it's
 * followed. One that isn't a reference is a node of the same tree, and a
 * reference can lead to a document in any of the session's media types (see
 * {@link SessionNode}).
 */
export type Followed<S, N> = FollowedNode<NonNullable<JsonMemberValue<N>>> | FollowedNode<SessionNode<S>>;

/**
 * The property `key` of an object or the item at index `key` of an array,
 * following a reference if it's one.
 *
 * @throws What `jsonStep` throws, like an `Error` whose `cause.code` is
 * `ERR_POINTER_NOT_FOUND` if the property or item doesn't exist.
 * @throws What `get` throws, if it follows a reference.
 */
export const jrefStep: <S extends DocumentSession, N extends AnyJsonNode>(session: S, key: string, node: N & Browsable<N>) => Promise<Followed<S, N>>;

/** Iterate over the items of an array, following the ones that are references. */
export const jrefArrayIter: <S extends DocumentSession, N extends AnyJsonNode>(session: S, node: N & Browsable<N>) => AsyncGenerator<Followed<S, N>, void, unknown>;

/** Iterate over the property values of an object, following the ones that are references. */
export const jrefObjectValues: <S extends DocumentSession, N extends AnyJsonNode>(session: S, node: N & Browsable<N>) => AsyncGenerator<Followed<S, N>, void, unknown>;

/**
 * Iterate over the `[name, node]` pairs of an object, following the values
 * that are references.
 */
export const jrefObjectEntries: <S extends DocumentSession, N extends AnyJsonNode>(session: S, node: N & Browsable<N>) => AsyncGenerator<[string, Followed<S, N>], void, unknown>;

/**
 * Whether an object has a property. It's `jsonObjectHas`, typed to take a
 * node that isn't a reference.
 */
export const jrefObjectHas: <N extends AnyJsonNode>(key: string, node: N & Browsable<N>) => boolean;

/**
 * Iterate over the property names of an object. It's `jsonObjectKeys`, typed
 * to take a node that isn't a reference.
 */
export const jrefObjectKeys: <N extends AnyJsonNode>(node: N & Browsable<N>) => Generator<string, void, unknown>;

/**
 * The value of a string, number, boolean, or null node as JavaScript.
 *
 * @throws An `Error` whose `cause.code` is `ERR_STRUCTURED_VALUE` for an
 * array or object. Getting their value would need to follow the references
 * in them. Its `url` is the node's location.
 */
export const jrefValue: {
  <N extends AnyJsonNode & { jsonType: "null" }>(node: N & Browsable<N>): null;
  <N extends AnyJsonNode & { jsonType: "boolean" }>(node: N & Browsable<N>): boolean;
  <N extends AnyJsonNode & { jsonType: "number" }>(node: N & Browsable<N>): number;
  <N extends AnyJsonNode & { jsonType: "string" }>(node: N & Browsable<N>): string;
  <N extends AnyJsonNode>(node: N & Browsable<N>): string | number | boolean | null;
};
