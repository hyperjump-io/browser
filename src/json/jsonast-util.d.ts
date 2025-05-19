import {
  Json,
  JsonArrayNode,
  JsonBooleanNode,
  JsonJsonNode,
  JsonNode,
  JsonNullNode,
  JsonNumberNode,
  JsonObjectNode,
  JsonStringNode
} from "./jsonast.d.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Reviver<T = JsonNode<any> | undefined> = <A>(node: JsonNode<JsonNode<A>>, key?: string) => T;

/**
 * Parse a JSON string into a JSON AST. Includes a reviver option similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}.
 *
 * @throws SynataxError
 */
export const fromJson: {
  (json: string, location?: string): JsonJsonNode;
  <R extends Reviver | undefined>(json: string, location: string | undefined, reviver: R): R extends undefined ? JsonJsonNode : ReturnType<R>;
};

/**
 * Parse a JSON compatible JavaScript value into a JSON AST.
 */
export const fromJs: (js: Json, location?: string) => JsonJsonNode;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Replacer = <A>(node: JsonNode<A>, key?: string) => JsonNode<any> | undefined;

/**
 * Stringify a JsonNode to a JSON string. Includes options for a
 * {@link Replacer} and `space` like
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify | JSON.stringify}.
 */
export const toJson: <A>(node: JsonNode<A>, replacer?: Replacer, space?: string) => string;

/**
 * Index into an object or array JsonNode.
 *
 * @throws {@link JsonPointerError}
 */
export const pointerStep: <A>(segment: string, node: JsonNode<A>, uri?: string) => A;

/**
 * Get a JsonNode using a JSON Pointer.
 */
export const pointerGet: (pointer: string, tree: JsonJsonNode, documentUri?: string) => JsonJsonNode;

export const jsonValue: (
  (<_A>(node: JsonNullNode) => null) &
  (<_A>(node: JsonBooleanNode) => boolean) &
  (<_A>(node: JsonNumberNode) => number) &
  (<_A>(node: JsonStringNode) => string) &
  (<A>(node: JsonArrayNode<A>) => Json[]) &
  (<A>(node: JsonObjectNode<A>) => Record<string, Json>) &
  (<A>(node: JsonNode<A>) => Json)
);

export const jsonObjectHas: <A>(key: string, node: JsonNode<A>) => boolean;

export const jsonArrayIter: <A>(node: JsonNode<A>) => Generator<A, void, unknown>;

export const jsonObjectKeys: <A>(node: JsonNode<A>) => Generator<string, void, unknown>;

export const jsonObjectValues: <A>(node: JsonNode<A>) => Generator<A, void, unknown>;

export const jsonObjectEntries: <A>(node: JsonNode<A>) => Generator<[string, A], void, unknown>;

export class JsonPointerError extends Error {
  constructor(message?: string);
}
