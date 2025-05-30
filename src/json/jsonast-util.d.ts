import type {
  Json,
  JsonArrayNode,
  JsonBooleanNode,
  JsonNode,
  JsonNullNode,
  JsonNumberNode,
  JsonObjectNode,
  JsonStringNode
} from "./jsonast.d.ts";

export type Reviver<A extends object, R extends JsonNode<A> | undefined> = (node: JsonNode<A>, key?: string) => R;

/**
 * Parse a JSON string into a JSON AST. Includes a reviver option similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}.
 *
 * @throws SynataxError
 */
export const fromJson: <A extends object = { type: "json" }, R extends JsonNode<A> | undefined = JsonNode<A>>(json: string, location?: string, reviver?: Reviver<A, R>) => R;

/**
 * Parse a JSON compatible JavaScript value into a JSON AST.
 */
export const fromJs: (js: Json, location?: string) => JsonNode;

export type Replacer = (node: JsonNode<unknown>, key?: string) => JsonNode<unknown> | undefined;

/**
 * Stringify a JsonNode to a JSON string. Includes options for a
 * {@link Replacer} and `space` like
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify | JSON.stringify}.
 */
export const toJson: (node: JsonNode<unknown>, replacer?: Replacer, space?: string) => string;

/**
 * Index into an object or array JsonNode.
 *
 * @throws {@link JsonPointerError}
 */
export const pointerStep: <A>(segment: string, node: JsonNode<A>, uri?: string) => JsonNode<A>;

/**
 * Get a JsonNode using a JSON Pointer.
 */
export const pointerGet: <A>(pointer: string, tree: JsonNode<A>, documentUri?: string) => JsonNode<A>;

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

export const jsonArrayIter: <A>(node: JsonNode<A>) => Generator<JsonNode<A>, void, unknown>;

export const jsonObjectKeys: <A>(node: JsonNode<A>) => Generator<string, void, unknown>;

export const jsonObjectValues: <A>(node: JsonNode<A>) => Generator<JsonNode<A>, void, unknown>;

export const jsonObjectEntries: <A>(node: JsonNode<A>) => Generator<[string, JsonNode<A>], void, unknown>;

export class JsonPointerError extends Error {
  constructor(message?: string);
}
