import {
  Json,
  JsonArrayNode,
  JsonBooleanNode,
  JsonCompatible,
  JsonNode,
  JsonNullNode,
  JsonNumberNode,
  JsonObjectNode,
  JsonStringNode
} from "./jsonast.d.ts";

export type Reviver<A> = (node: JsonCompatible<NonNullable<A>>, key?: string) => A;

/**
 * Parse a JSON string into a JSON AST. Includes a reviver option similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}.
 *
 * @throws SynataxError
 */
export const fromJson: <A = JsonNode>(json: string, reviver?: Reviver<A>) => A;

/**
 * Parse a JSON compatible JavaScript value into a JSON AST.
 */
export const fromJs: (js: Json) => JsonNode;

export type Replacer<A = JsonNode> = (node: A, key?: string) => JsonCompatible<A> | undefined;

/**
 * Stringify a JsonNode to a JSON string. Includes options for a
 * {@link Replacer} and `space` like
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify | JSON.stringify}.
 */
export const toJson: <A>(node: A, replacer?: Replacer<A>, space?: string) => string;

/**
 * Index into an object or array JsonNode.
 *
 * @throws {@link JsonPointerError}
 */
export const pointerStep: (segment: string, node: JsonNode, uri?: string) => JsonNode;

/**
 * Get a JsonNode using a JSON Pointer.
 */
export const pointerGet: (pointer: string, tree: JsonNode, documentUri?: string) => JsonNode;

export const jsonValue: (
  (<_A>(node: JsonNullNode) => null) &
  (<_A>(node: JsonBooleanNode) => boolean) &
  (<_A>(node: JsonNumberNode) => number) &
  (<_A>(node: JsonStringNode) => string) &
  (<A>(node: JsonArrayNode<A>) => Json[]) &
  (<A>(node: JsonObjectNode<A>) => Record<string, Json>) &
  (<A>(node: JsonCompatible<A>) => unknown)
);

export const jsonTypeOf: (
  (<A>(node: JsonCompatible<A>, type: "null") => node is JsonNullNode) &
  (<A>(node: JsonCompatible<A>, type: "boolean") => node is JsonBooleanNode) &
  (<A>(node: JsonCompatible<A>, type: "number") => node is JsonNumberNode) &
  (<A>(node: JsonCompatible<A>, type: "string") => node is JsonStringNode) &
  (<A>(node: JsonCompatible<A>, type: "array") => node is JsonArrayNode<A>) &
  (<A>(node: JsonCompatible<A>, type: "object") => node is JsonObjectNode<A>)
);

export const jsonObjectHas: <A>(key: string, node: JsonCompatible<A>) => boolean;

export const jsonArrayIter: <A>(node: JsonCompatible<A>) => Generator<A, void, unknown>;

export const jsonObjectKeys: <A>(node: JsonCompatible<A>) => Generator<string, undefined, string>;

export const jsonObjectValues: <A>(node: JsonCompatible<A>) => Generator<A, void, unknown>;

export const jsonObjectEntries: <A>(node: JsonCompatible<A>) => Generator<[string, A], void, unknown>;

export class JsonPointerError extends Error {
  constructor(message?: string);
}
