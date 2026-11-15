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

/**
 * A node a walk from a node of type `N` can reach in session `S`: the node,
 * or what's under it once it's followed. A value that isn't a reference is
 * a node of the same tree, and a reference can lead to a document in any of
 * the session's media types.
 */
export type Reachable<S, N> = N | Followed<S, N>;

export const CONTINUE: true;
export const SKIP: "skip";
export const EXIT: false;

/**
 * What a {@link JrefVisitor} returns: {@link CONTINUE} (or nothing) to
 * visit the node's members, {@link SKIP} to go on without them, or
 * {@link EXIT} to stop. They're the same values as `unist-util-visit`'s, so
 * either package's constants work with both.
 */
export type VisitAction = typeof CONTINUE | typeof SKIP | typeof EXIT;

/**
 * Called with each node {@link jrefVisit} visits. `key` and `parent` are
 * where the node is in the tree with its references followed: the property
 * name or array index it's at, and the node that has it. They're
 * `undefined` for the node the visit starts at. A node reached through a
 * reference is somewhere else, which its `location` says. `depth` is how
 * many levels below the node the visit starts at it is, so returning
 * {@link SKIP} at a depth limits how deep the visit goes.
 *
 * `T` is the nodes the visit can reach, and `V` is the ones the visitor
 * gets, which a test narrows.
 */
export type JrefVisitor<T, V = T> = (
  node: V,
  key: string | undefined,
  parent: T | undefined,
  depth: number
) => VisitAction | void | Promise<VisitAction | void>;

/**
 * Which nodes {@link jrefVisit} gives its visitor, the way
 * `unist-util-is` tests a node:
 *
 * - `null` or `undefined` passes every node.
 * - A string is a `type`, like `"json"`.
 * - An object is properties the node has to have, each equal (`===`) to
 *   the node's, like `{ jsonType: "object" }`.
 * - A function is called with the node, its key, and its parent, and
 *   passes if it returns something truthy. A type predicate narrows the
 *   visitor's node.
 * - An array passes if any of its tests does. Its tests can't be arrays,
 *   like `unist-util-is`'s.
 */
export type JrefTest<T> = JrefCheck<T> | readonly JrefCheck<T>[] | null | undefined;

/**
 * A {@link JrefTest} that isn't an array
 */
export type JrefCheck<T>
  = string
    | { readonly [property: string]: unknown }
    | ((node: T, key: string | undefined, parent: T | undefined) => unknown);

/**
 * The nodes of type `N` that can pass the test `C`, for a
 * {@link JrefVisitor}'s node
 */
export type JrefTestedNode<N, C> = C extends null | undefined ? N
  : C extends (node: any, ...rest: any[]) => node is infer M ? Extract<N, M> extends never ? M : Extract<N, M>
    : C extends (...args: any[]) => unknown ? N
      : C extends readonly (infer U)[] ? JrefTestedNode<N, U>
        : C extends string ? HasProperties<N, { type: C }>
          : HasProperties<N, C>;

/**
 * The members of `N` that can have the properties of `O`, with them
 */
type HasProperties<N, O> = N extends unknown
  ? keyof O extends keyof N
    ? O extends { [K in keyof O]: K extends keyof N ? N[K] : never } ? N & O : never
    : never
  : never;

/**
 * Visit a node and every value under it, depth first in document order,
 * following references, like `unist-util-visit` does for a tree as it's
 * written. It visits the values, not the `json-property` nodes, so the
 * visitor gets the same nodes the other `jref*` functions return.
 *
 * A reference is followed just before its value is visited, so a member of
 * a node the visitor skips isn't retrieved. A value that's reached again
 * through two references is visited each time. A reference back to a node
 * that's being visited, like a recursive definition, is visited, but its
 * members aren't, because they're already being visited.
 *
 * With a {@link JrefTest}, the visitor only gets the nodes that pass it,
 * and its node is narrowed to them. The walk still goes through the nodes
 * that don't, and follows their references, to find what's under them.
 *
 * To find the references in a tree without following them, use
 * `unist-util-visit` with the `"reference"` type.
 *
 * @throws What `get` throws, if it follows a reference.
 * @throws A `TypeError` if a test isn't `null`, `undefined`, a string, an
 * object, a function, or an array of strings, objects, and functions.
 */
export const jrefVisit: {
  <S extends DocumentSession, N extends AnyJsonNode, const C extends JrefTest<Reachable<S, N>>>(session: S, node: N & Browsable<N>, test: C, visitor: JrefVisitor<Reachable<S, N>, JrefTestedNode<Reachable<S, N>, C>>): Promise<void>;
  <S extends DocumentSession, N extends AnyJsonNode>(session: S, node: N & Browsable<N>, visitor: JrefVisitor<Reachable<S, N>>): Promise<void>;
};
