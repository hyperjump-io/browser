import type { VFileMessage } from "vfile-message";
import type {
  Json,
  JsonBooleanNode,
  JsonCommentNode,
  JsonDocumentNode,
  JsonErrorNode,
  JsonMissingNode,
  JsonNode,
  JsonNullNode,
  JsonNumberNode,
  JsonPropertyNameNode,
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
 * Any JSON AST node. The utilities take the type of the node you give them
 * rather than inferring its annotations, so they work with any annotated tree,
 * such as a JRef or JSON Schema AST.
 */
export type AnyJsonNode = JsonNode<unknown, unknown, unknown>;

/**
 * The type of the values of an object node and the items of an array node.
 */
export type JsonMember<N> = N extends { jsonType: "array"; children: (infer M)[] } ? M
  : N extends { jsonType: "object"; children: (infer C)[] } ? C extends { children: [JsonPropertyNameNode, infer M] } ? M : never
    : never;

/**
 * The value of an object member or array item. A {@link JsonMissingNode} from
 * a failed parse is presented as `undefined`. A {@link JsonInvalidNode} is
 * returned as is.
 */
export type JsonMemberValue<N> = Exclude<JsonMember<N>, JsonMissingNode> | (JsonMissingNode extends JsonMember<N> ? undefined : never);

/**
 * Index into an object or array JsonNode. If the property or item exists but
 * its value is missing, the result is `undefined`.
 *
 * @throws A {@link JsonPointerError} if the property or item doesn't exist.
 */
export const pointerStep: <N extends AnyJsonNode>(segment: string, node: N, uri?: string) => JsonMemberValue<N>;

/**
 * Get a JsonNode using a JSON Pointer. If the last segment points to a missing
 * value, the result is `undefined`.
 *
 * @throws A {@link JsonPointerError} if the pointer doesn't resolve,
 * including when it tries to index into a missing or invalid value.
 */
export const pointerGet: <N extends AnyJsonNode>(pointer: string, tree: N, documentUri?: string) => N | JsonMemberValue<N>;

/**
 * The value of a node as a JavaScript value. Arrays and objects are copied.
 * References aren't followed, so a reference in a JRef tree is the object it
 * was written as.
 *
 * In a tree from a parse whose status is `failure`, a value that couldn't be
 * parsed ({@link JsonErrorNode}) is left out when it's a property value and is
 * `null` when it's an array item, so the items after it keep their positions.
 * That's how {@link toJson} treats a missing value.
 */
export const jsonValue: (
  ((node: JsonNullNode) => null)
  & ((node: JsonBooleanNode) => boolean)
  & ((node: JsonNumberNode) => number)
  & ((node: JsonStringNode) => string)
  & ((node: AnyJsonNode & { jsonType: "array" }) => Json[])
  & ((node: AnyJsonNode & { jsonType: "object" }) => Record<string, Json>)
  & ((node: AnyJsonNode) => Json)
);

export const jsonObjectHas: (key: string, node: AnyJsonNode) => boolean;

export const jsonArrayIter: <N extends AnyJsonNode>(node: N) => Generator<JsonMemberValue<N>, void, unknown>;

export const jsonObjectKeys: (node: AnyJsonNode) => Generator<string, void, unknown>;

export const jsonObjectValues: <N extends AnyJsonNode>(node: N) => Generator<JsonMemberValue<N>, void, unknown>;

export const jsonObjectEntries: <N extends AnyJsonNode>(node: N) => Generator<[string, JsonMemberValue<N>], void, unknown>;

export class JsonPointerError extends Error {
  constructor(message?: string);
}
