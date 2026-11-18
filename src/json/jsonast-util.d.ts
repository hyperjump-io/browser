import type { Position } from "unist";
import type {
  Json,
  JsonDocumentNode,
  JsonErrorNode,
  JsonMissingNode,
  JsonNode,
  JsonPropertyNameNode,
  JsonParseStatus,
  ReadonlyJson
} from "./jsonast.d.ts";

/**
 * Parse a JSON string into a JSON document, whose root is the AST of the
 * value, like `fromMarkdown` from `mdast-util-from-markdown`. `url` is the
 * document's URL, which every node's location starts with. It's the
 * document the `jref*` functions read, and that the JSON media type and
 * `rejsonParse` make.
 *
 * Nothing in the document makes it throw. Malformed input produces an AST
 * whenever possible and the document's `status` says how much to trust it.
 * See {@link JsonParseResult}.
 *
 * @throws {TypeError} If `url` isn't a URL or has a fragment. It's the
 *   caller's mistake, not the document's.
 */
export const fromJson: (json: string, url: string, options?: JsonOptions) => JsonParseResult<JsonDocumentNode>;

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

/**
 * The result of a parse: the document, which has any parse status, and
 * every syntax error found, in document order. {@link hasStatus} narrows
 * the document by its status. `D` is the type of the document, and `E` is
 * the type of the errors.
 */
export type JsonParseResult<D, E = JsonSyntaxError> = {
  document: D;
  errors: E[];
};

/**
 * A syntax error found by the parser. It's plain data. Use
 * {@link jsonSyntaxErrorMessage} to describe it when reporting it, such as in
 * a VFileMessage.
 */
export type JsonSyntaxError = {
  source: "json";
  ruleId: JsonSyntaxErrorCode;

  /** The span of text the error is about */
  place: Position;

  /** The text that was found, for errors about something unexpected */
  actual?: string;
};

/**
 * A description of a syntax error for people, such as "Trailing commas are
 * not allowed"
 */
export const jsonSyntaxErrorMessage: (error: JsonSyntaxError) => string;

/**
 * The `ruleId` of each syntax error.
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
    | "number-out-of-range"
    | "invalid-literal"
    | "comment-not-allowed"
    | "comment-not-closed"
    | "max-depth-exceeded";

/**
 * Parse a JSON compatible JavaScript value into a JSON AST. `location` is the
 * root node's location, like `https://example.com/doc#/a`. A URL without a
 * fragment is a document's, so its root is `#`.
 *
 * @throws {TypeError} If `location` isn't a URL, or a value isn't JSON,
 * like a number that isn't finite.
 */
export const fromJs: (js: ReadonlyJson, location: string) => JsonNode;

export type ToJsonOptions = {
  /**
   * The indentation for each level, like the `space` of
   * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify | JSON.stringify}:
   * a number of spaces, or a string. Either is up to 10. Without it, the
   * JSON is on one line.
   */
  space?: string | number;
};

/**
 * Stringify a JsonNode to a JSON string.
 *
 * A tree from a failed parse can contain values that JSON can't represent.
 * Like `JSON.stringify` does with `undefined`, a {@link JsonMissingNode} is
 * left out when it's a property value and written as `null` when it's an array
 * item, so the items after it keep their positions. A missing root produces an
 * empty string.
 *
 * @throws An `Error` whose `cause.code` is `ERR_INVALID_VALUE` if the tree
 * contains a {@link JsonInvalidNode}. Its `url` is the node's location.
 */
export const toJson: (node: JsonNode<unknown, JsonErrorNode> | JsonErrorNode, options?: ToJsonOptions) => string;

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
 * @throws An `Error` whose `cause.code` says why the step can't be taken,
 * and whose `url` is the location it didn't reach:
 * - `ERR_POINTER_NOT_FOUND`: the property or item doesn't exist
 * - `ERR_POINTER_INVALID_INDEX`: the key isn't an array index
 * - `ERR_POINTER_DUPLICATE_PROPERTY`: the object has the property twice
 * - `ERR_POINTER_NOT_INDEXABLE`: the node isn't an object or an array
 */
export const jsonStep: <N extends AnyJsonNode>(key: string, node: N) => JsonMemberValue<N>;

/**
 * Get a JsonNode using a JSON Pointer. If the last segment points to a missing
 * value, the result is `undefined`.
 *
 * @throws What {@link jsonStep} throws if the pointer doesn't resolve. A
 * pointer that goes into a missing or invalid value is
 * `ERR_POINTER_NOT_INDEXABLE` too, at that value's location.
 * @throws A `TypeError` if `pointer` isn't a JSON Pointer: one that isn't
 * empty and doesn't start with `/`, or has a `~` that isn't `~0` or `~1`.
 */
export const jsonPointerGet: <N extends AnyJsonNode>(pointer: string, tree: N) => N | JsonMemberValue<N>;

/**
 * The value of a node as a JavaScript value. Arrays and objects are copied.
 * References aren't followed, so a reference in a JRef tree is the object it
 * was written as.
 *
 * In a tree from a parse whose status is `failure`, a value that couldn't be
 * parsed ({@link JsonErrorNode}) is left out when it's a property value and is
 * `null` when it's an array item, so the items after it keep their positions.
 * That's how {@link toJson} treats a missing value.
 *
 * A property's name ({@link JsonPropertyNameNode}) is a string.
 */
export const jsonValue: <N extends AnyJsonNode | JsonPropertyNameNode>(node: N) => JsonTypeValue[N["jsonType"]];

/**
 * The JavaScript value of a node of each `jsonType`. A node whose `jsonType`
 * is one of several, like a node that's a string or a boolean, has a value
 * of one of their types.
 */
export type JsonTypeValue = {
  null: null;
  boolean: boolean;
  number: number;
  string: string;
  array: Json[];
  object: Record<string, Json>;
};

export const jsonObjectHas: (key: string, node: AnyJsonNode) => boolean;

export const jsonArrayIter: <N extends AnyJsonNode>(node: N) => IteratorObject<JsonMemberValue<N>, undefined, unknown>;

export const jsonObjectKeys: (node: AnyJsonNode) => IteratorObject<string, undefined, unknown>;

export const jsonObjectValues: <N extends AnyJsonNode>(node: N) => IteratorObject<JsonMemberValue<N>, undefined, unknown>;

export const jsonObjectEntries: <N extends AnyJsonNode>(node: N) => IteratorObject<[string, JsonMemberValue<N>], undefined, unknown>;
