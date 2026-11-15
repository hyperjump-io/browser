import type { DocumentSession, FollowedNode, SessionNode } from "./documents.d.ts";
import type { AnyJsonNode, JsonMemberValue } from "../json/jsonast-util.d.ts";

/**
 * What a value of an object node or an item of an array node is once it's
 * followed. One that isn't a reference is a node of the same tree, and a
 * reference can lead to a document in any of the session's media types (see
 * {@link SessionNode}).
 */
export type Followed<S, N> = FollowedNode<NonNullable<JsonMemberValue<N>>> | FollowedNode<SessionNode<S>>;

/**
 * A node a walk from a node of type `N` can reach in session `S`: the node,
 * or what's under it, once each is followed. A value that isn't a reference
 * is a node of the same tree, and a reference, including one the walk
 * starts at, can lead to a document in any of the session's media types.
 */
export type Reachable<S, N> = FollowedNode<N> | Followed<S, N>;

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
 * a node the visitor skips isn't retrieved. If `node` is a reference, the
 * visit starts at what it leads to. A value that's reached again
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
 * @throws An `Error` whose `cause.code` is `ERR_MAX_DEPTH` if it would go
 * more than {@link WalkOptions.maxDepth} levels below the node. The cause
 * has the `maxDepth`, and its `url` is the node it would go under.
 * @throws What `get` throws, if it follows a reference.
 * @throws A `TypeError` if a test isn't `null`, `undefined`, a string, an
 * object, a function, or an array of strings, objects, and functions.
 * @throws A `RangeError` if `maxDepth` isn't a whole number that isn't
 * negative, or `Infinity`.
 */
export const jrefVisit: {
  <S extends DocumentSession, N extends AnyJsonNode, const C extends JrefTest<Reachable<S, N>>>(session: S, node: N, test: C, visitor: JrefVisitor<Reachable<S, N>, JrefTestedNode<Reachable<S, N>, C>>, options?: WalkOptions): Promise<void>;
  <S extends DocumentSession, N extends AnyJsonNode>(session: S, node: N, visitor: JrefVisitor<Reachable<S, N>>, options?: WalkOptions): Promise<void>;
};

/**
 * The first node under `node`, or `node` itself, that passes a
 * {@link JrefTest}, in the order {@link jrefVisit} visits them, like
 * `unist-util-find`. It's `undefined` if none does. The walk stops at the
 * first that passes, so nothing after it is retrieved. It's narrowed to
 * what can pass the test.
 *
 * @throws What {@link jrefVisit} throws.
 */
export const jrefFind: <S extends DocumentSession, N extends AnyJsonNode, const C extends JrefTest<Reachable<S, N>>>(session: S, node: N, test: C, options?: WalkOptions) => Promise<JrefTestedNode<Reachable<S, N>, C> | undefined>;

/**
 * Every node under `node`, and `node` itself, that passes a
 * {@link JrefTest}, in the order {@link jrefVisit} visits them. Each is
 * there once, even if it's reached through more than one reference.
 *
 * @throws What {@link jrefVisit} throws.
 */
export const jrefFindAll: <S extends DocumentSession, N extends AnyJsonNode, const C extends JrefTest<Reachable<S, N>>>(session: S, node: N, test: C, options?: WalkOptions) => Promise<JrefTestedNode<Reachable<S, N>, C>[]>;

/**
 * Options for the functions that walk everything under a node, following
 * references: {@link jrefVisit}, {@link jrefFind}, {@link jrefFindAll},
 * `jrefSelect`, and `jrefSelectAll`.
 */
export type WalkOptions = {
  /**
   * How many levels below the node a walk can go before it's an `Error`
   * whose `cause.code` is `ERR_MAX_DEPTH`. The node is at depth 0, and its
   * members are at 1. It's a guard against references that lead to new
   * documents without end, like a `next` link on every page of results,
   * and not a way to choose how deep to go. To walk less, return
   * {@link SKIP} from a visitor at a `depth`, or write a selector of child
   * combinators, like `> [key=next] > [key=next]`.
   *
   * It's only an error if the walk would go under a node at `maxDepth`:
   * the visitor didn't skip it, it isn't a reference back to a node that's
   * being walked, it has members, and for a selector, one of them could
   * match or have a match under it. It's 1000 by default, the deepest a
   * parsed document can nest. `Infinity` doesn't limit the depth.
   */
  maxDepth?: number;
};
