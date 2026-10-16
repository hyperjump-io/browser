import type { VFileMessage } from "vfile-message";
import type {
  Json,
  JsonArrayNode,
  JsonBooleanNode,
  JsonCommentNode,
  JsonDocumentNode,
  JsonErrorNode,
  JsonMissingNode,
  JsonNode,
  JsonNullNode,
  JsonNumberNode,
  JsonObjectNode,
  JsonParseStatus,
  JsonStringNode
} from "./jsonast.d.ts";

export type Reviver<A extends object, R extends JsonNode<A, X> | undefined, X = never> = (node: JsonNode<A, X>, key?: string) => R;

/**
 * Parse a JSON string into a JSON AST. Includes a reviver option similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}.
 *
 * Parsing never throws. Malformed input produces an AST whenever possible and
 * the result's `status` says how much to trust it. See {@link JsonParseResult}.
 * The reviver isn't called for {@link JsonErrorNode}s.
 */
export const fromJson: <A extends object = { type: "json" }, R extends JsonNode<A, JsonErrorNode> | undefined = JsonNode<A, JsonErrorNode>>(json: string, location?: string, reviver?: Reviver<A, R, JsonErrorNode>, options?: JsonOptions) => JsonParseResult<JsonNode<A> | Extract<R, undefined>, R | JsonErrorNode>;

/**
 * Check a document's parse status. Unlike checking `document.status`
 * directly, this narrows the document's type, so a document that passes for
 * `"success"` or `"recovered"` is known not to contain any
 * {@link JsonErrorNode}s.
 *
 * ```js
 * if (hasStatus(document, "success", "recovered")) {
 *   // document.children has no JsonErrorNodes
 * }
 * ```
 */
export const hasStatus: <S extends JsonParseStatus>(document: JsonDocumentNode, status: S, ...statuses: S[]) => document is JsonDocumentNode<S>;

export type JsonOptions = {
  /**
   * Allow `//` and `/* *\/` comments, as in JSONC. Comments aren't part of
   * the AST. They're listed separately, in the order they appear.
   */
  allowComments?: boolean;
};

type JsonParseResultBase = {
  /**
   * Every comment, in document order. It's empty unless comments are allowed.
   */
  comments: JsonCommentNode[];
};

/**
 * The result of a parse. Discriminate on `status` to get the type of the AST.
 * Only a `failure` can contain {@link JsonErrorNode}s. `S` is the AST type for
 * `success` and `recovered` and `F` is the AST type for `failure`.
 *
 * Every syntax error found is in `messages`, in document order. Each
 * message's `ruleId` is a {@link JsonSyntaxErrorCode}.
 */
export type JsonParseResult<S, F> = JsonParseResultBase & (
  { status: "success"; node: S; messages: [] }
  | { status: "recovered"; node: S; messages: VFileMessage[] }
  | { status: "failure"; node: F; messages: VFileMessage[] }
);

/**
 * The `ruleId` of each syntax error message.
 */
export type JsonSyntaxErrorCode
  = "trailing-comma"
    | "comma-expected"
    | "colon-expected"
    | "value-expected"
    | "brace-not-closed"
    | "bracket-not-closed"
    | "unexpected-token"
    | "end-of-file-expected"
    | "property-key-expected"
    | "property-key-not-quoted"
    | "property-key-single-quoted"
    | "string-single-quoted"
    | "string-not-closed"
    | "invalid-escape"
    | "invalid-character"
    | "number-invalid"
    | "invalid-literal"
    | "comment-not-allowed"
    | "comment-not-closed"
    | "max-depth-exceeded";

/**
 * Parse a JSON compatible JavaScript value into a JSON AST.
 */
export const fromJs: (js: Json, location?: string) => JsonNode;

export type Replacer = (node: JsonNode<unknown>, key?: string) => JsonNode<unknown> | undefined;

/**
 * Stringify a JsonNode to a JSON string. Includes options for a
 * {@link Replacer} and `space` like
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify | JSON.stringify}.
 *
 * A tree from a failed parse can contain values that JSON can't represent.
 * Like `JSON.stringify` does with `undefined`, a {@link JsonMissingNode} is
 * left out when it's a property value and written as `null` when it's an array
 * item, so the items after it keep their positions. A missing root produces an
 * empty string. The replacer isn't called for missing values.
 *
 * @throws TypeError if the tree contains a {@link JsonInvalidNode}.
 */
export const toJson: (node: JsonNode<unknown, JsonErrorNode> | JsonErrorNode, replacer?: Replacer, space?: string) => string;

/**
 * The value of an object member or array item. A {@link JsonMissingNode} from
 * a failed parse is presented as `undefined`. A {@link JsonInvalidNode} is
 * returned as is.
 */
export type JsonMemberValue<A, X = never> = JsonNode<A, X> | Exclude<X, JsonMissingNode> | (JsonMissingNode extends X ? undefined : never);

/**
 * Index into an object or array JsonNode. If the property or item exists but
 * its value is missing, the result is `undefined`.
 *
 * @throws {@link JsonPointerError} if the property or item doesn't exist.
 */
export const pointerStep: <A, X = never>(segment: string, node: JsonNode<A, X>, uri?: string) => JsonMemberValue<A, X>;

/**
 * Get a JsonNode using a JSON Pointer. If the last segment points to a missing
 * value, the result is `undefined`.
 *
 * @throws {@link JsonPointerError} if the pointer doesn't resolve, including
 * when it tries to index into a missing or invalid value.
 */
export const pointerGet: <A, X = never>(pointer: string, tree: JsonNode<A, X>, documentUri?: string) => JsonMemberValue<A, X>;

export const jsonValue: (
  (<_A>(node: JsonNullNode) => null)
  & (<_A>(node: JsonBooleanNode) => boolean)
  & (<_A>(node: JsonNumberNode) => number)
  & (<_A>(node: JsonStringNode) => string)
  & (<A>(node: JsonArrayNode<A>) => Json[])
  & (<A>(node: JsonObjectNode<A>) => Record<string, Json>)
  & (<A, X>(node: JsonNode<A, X>) => Json)
);

export const jsonObjectHas: <A, X = never>(key: string, node: JsonNode<A, X>) => boolean;

export const jsonArrayIter: <A, X = never>(node: JsonNode<A, X>) => Generator<JsonMemberValue<A, X>, void, unknown>;

export const jsonObjectKeys: <A, X = never>(node: JsonNode<A, X>) => Generator<string, void, unknown>;

export const jsonObjectValues: <A, X = never>(node: JsonNode<A, X>) => Generator<JsonMemberValue<A, X>, void, unknown>;

export const jsonObjectEntries: <A, X = never>(node: JsonNode<A, X>) => Generator<[string, JsonMemberValue<A, X>], void, unknown>;

export class JsonPointerError extends Error {
  constructor(message?: string);
}
