import type { DocumentSession, SessionDocument, Start, StartTarget, Target } from "./documents.d.ts";
import type { Followed, IsManual } from "./visit.d.ts";
import type { AnyJsonNode, JsonMemberValue, JsonTypeValue } from "../json/jsonast-util.d.ts";

/** Options for the functions that step into a target one level */
export type StepOptions = {
  /**
   * What to do with a member that's a reference, like `get`'s option.
   * `"follow"`, the default, follows it, and any reference that leads to,
   * until there's a value. `"manual"` doesn't, so the member's target is
   * the node as it's written, in the same document.
   */
  reference?: "follow" | "manual";
};

/**
 * The target of a member of target `T`'s node in session `S`. A member
 * that isn't a reference is a node of the same tree in the same document.
 * A reference can lead to a document in any of the session's media types,
 * unless the options `O` say not to follow it, and then it's a node of the
 * same tree that can be a reference.
 */
export type MemberTarget<S, T, O = StepOptions> = T extends Target<infer D, infer N>
  ? IsManual<O> extends true ? Target<D, NonNullable<JsonMemberValue<N>>> : Target<D | SessionDocument<S>, Followed<S, N>>
  : never;

/**
 * The member of a target's node at `key`, the name of a property of an
 * object or the index of an item of an array, as a target. A reference is
 * followed, unless `reference` is `"manual"`.
 *
 * It's for code that decides what to step into and builds a result from
 * what comes back. To reach a value by a path, use `jrefSelect`, and to do
 * something at every value, use `jrefVisit`.
 *
 * @throws What `jsonStep` throws, like an `Error` whose `cause.code` is
 * `ERR_POINTER_NOT_FOUND` if the property or item doesn't exist.
 * @throws What `get` throws, if it follows a reference.
 */
export const jrefStep: <S extends DocumentSession, T extends Start<AnyJsonNode>, const O extends StepOptions = StepOptions>(session: S, key: string, target: T, options?: O) => Promise<MemberTarget<S, StartTarget<T>, O>>;

/**
 * The items of an array as targets, in order. Each one that's a reference
 * is followed when the iterator reaches it, unless `reference` is
 * `"manual"`, so a loop that stops early retrieves less. An item that's
 * missing from a parse that failed is left out. It has no items if the
 * node isn't an array.
 *
 * @throws What `get` throws, from `next()`, if it follows a reference.
 */
export const jrefArrayIter: <S extends DocumentSession, T extends Start<AnyJsonNode>, const O extends StepOptions = StepOptions>(session: S, target: T, options?: O) => AsyncIteratorObject<MemberTarget<S, StartTarget<T>, O>, undefined, unknown>;

/**
 * The property values of an object as targets, in order, followed like
 * {@link jrefArrayIter}'s items. It has none if the node isn't an object.
 */
export const jrefObjectValues: <S extends DocumentSession, T extends Start<AnyJsonNode>, const O extends StepOptions = StepOptions>(session: S, target: T, options?: O) => AsyncIteratorObject<MemberTarget<S, StartTarget<T>, O>, undefined, unknown>;

/**
 * The `[name, target]` pairs of an object's properties, in order, with the
 * values followed like {@link jrefArrayIter}'s items. It has none if the
 * node isn't an object.
 */
export const jrefObjectEntries: <S extends DocumentSession, T extends Start<AnyJsonNode>, const O extends StepOptions = StepOptions>(session: S, target: T, options?: O) => AsyncIteratorObject<[string, MemberTarget<S, StartTarget<T>, O>], undefined, unknown>;

/**
 * Whether an object has a property. Nothing needs following to read a
 * property name, so it doesn't take the session.
 */
export const jrefObjectHas: (key: string, target: Start<AnyJsonNode>) => boolean;

/** The property names of an object, in order. It has none if the node isn't an object. */
export const jrefObjectKeys: (target: Start<AnyJsonNode>) => IteratorObject<string, undefined, unknown>;

/**
 * The value of a target whose node is a string, number, boolean, or null,
 * as JavaScript.
 *
 * @throws An `Error` whose `cause.code` is `ERR_STRUCTURED_VALUE` for an
 * array or object. Getting their value would need to follow the references
 * in them. Its `url` is the node's location.
 */
export const jrefValue: {
  <N extends AnyJsonNode & { jsonType: "null" | "boolean" | "number" | "string" }>(target: Start<N>): JsonTypeValue[N["jsonType"]];
  (target: Start<AnyJsonNode>): string | number | boolean | null;
};
