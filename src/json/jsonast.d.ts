import type { AbsoluteIri, IriReference } from "@hyperjump/uri";
import type { Data, Position } from "unist";

export type JsonNullNode = {
  type: string;
  jsonType: "null";
  value: null;
  location: IriReference;
  data?: Data;
  position?: Position;
};

export type JsonBooleanNode = {
  type: string;
  jsonType: "boolean";
  value: boolean;
  location: IriReference;
  data?: Data;
  position?: Position;
};

export type JsonNumberNode = {
  type: string;
  jsonType: "number";
  value: number;
  location: IriReference;
  data?: Data;
  position?: Position;
};

export type JsonStringNode = {
  type: string;
  jsonType: "string";
  value: string;
  location: IriReference;
  data?: Data;
  position?: Position;
};

export type JsonArrayNode<A, X = never, P = unknown> = {
  type: string;
  jsonType: "array";
  children: (JsonNode<A, X, P> | X)[];
  location: IriReference;
  data?: Data;
  position?: Position;
};

export type JsonPropertyNameNode = {
  type: "json-property-name";
  jsonType: "string";
  value: string;
  data?: Data;
  position?: Position;
};

export type JsonPropertyNode<A, X = never, P = unknown> = P & {
  type: "json-property";
  children: [JsonPropertyNameNode, JsonNode<A, X, P> | X];
  data?: Data;
  position?: Position;
};

export type JsonObjectNode<A, X = never, P = unknown> = {
  type: string;
  jsonType: "object";
  children: JsonPropertyNode<A, X, P>[];
  location: IriReference;
  data?: Data;
  position?: Position;
};

/**
 * A JSON value. `A` is the annotations every node in the tree has. `X` is the
 * other kinds of nodes that can appear where a value is expected. It's
 * `never` for a complete tree and {@link JsonErrorNode} for a tree from a
 * parse whose status is `failure`. `P` is the annotations every property node
 * in the tree has. It's for languages built on JSON that give meaning to
 * object properties, such as the keywords of a JSON Schema.
 */
export type JsonNode<A = { type: "json" }, X = never, P = unknown> = A & (
  JsonObjectNode<A, X, P>
  | JsonArrayNode<A, X, P>
  | JsonStringNode
  | JsonNumberNode
  | JsonBooleanNode
  | JsonNullNode
);

/**
 * A value that isn't valid JSON, such as `NaN`, `True`, or `01`. Only a parse
 * whose status is `failure` produces these.
 */
export type JsonInvalidNode = {
  type: "json-invalid";
  /** The text as it was written */
  raw: string;
  location: IriReference;
  data?: Data;
  position?: Position;
};

/**
 * A place where a value was expected but none was given, such as a property
 * with nothing after its colon or a gap between two commas in an array. The
 * node has zero width and is positioned at the end of the token before it.
 * Only a parse whose status is `failure` produces these.
 */
export type JsonMissingNode = {
  type: "json-missing";
  location: IriReference;
  data?: Data;
  position?: Position;
};

/**
 * The nodes a parse uses in place of a value it couldn't recover.
 */
export type JsonErrorNode = JsonInvalidNode | JsonMissingNode;

/**
 * A JSON value from a parse whose status is `failure`. Anywhere below it, a
 * value can be a {@link JsonErrorNode}.
 */
export type JsonTolerantNode<A = { type: "json" }> = JsonNode<A, JsonErrorNode>;

export type JsonType = "null" | "boolean" | "number" | "string" | "array" | "object";

/**
 * A `//` or `/* *\/` comment. Comments are only allowed with the
 * `allowComments` option.
 */
export type JsonCommentNode = {
  type: "json-comment";
  kind: "line" | "block";
  /** The text between the delimiters */
  value: string;
  data?: Data;
  position?: Position;
};

/**
 * - `success`: The input is valid.
 * - `recovered`: The input has syntax errors, but each one could be resolved
 *   by interpreting what was intended, such as ignoring a trailing comma or
 *   closing an unclosed bracket. The AST is a complete value.
 * - `failure`: The AST can't fully represent the input. Some value is invalid
 *   or missing, a property name is missing, or some input had to be discarded.
 */
export type JsonParseStatus = "success" | "recovered" | "failure";

/**
 * The children of a document with parse status `S`. Only a `failure` can
 * contain {@link JsonErrorNode}s.
 */
export type JsonStatusChildren<S extends JsonParseStatus, N, T> = S extends "failure" ? (T | JsonErrorNode)[] : N[];

/**
 * A JSON document. `S` is the parse status. A document from the parser could
 * have any status. It's a single type rather than a union of one type per
 * status because unified's processor types don't work with a union, so
 * checking `status` doesn't narrow `children`. Once you've checked the status,
 * you can use a narrower type such as `JsonDocumentNode<"success">`, whose
 * children can't contain {@link JsonErrorNode}s.
 */
export type JsonDocumentNode<S extends JsonParseStatus = JsonParseStatus> = {
  type: "json-document";
  status: S;
  children: JsonStatusChildren<S, JsonNode, JsonTolerantNode>;
  /**
   * Every comment in the document, in document order. Comments aren't
   * children because they can appear anywhere, including places that aren't
   * part of any value, like between a property name and its colon. Use their
   * positions to relate them to values. It's empty unless comments are
   * allowed.
   */
  comments: JsonCommentNode[];
  /** The document's URI, which its nodes' locations start with, if it has one */
  uri?: AbsoluteIri;
  data?: Data;
};

export type Json = null | boolean | number | string | Json[] | { [property: string]: Json };

/**
 * JSON that won't be changed, for functions that take JSON and only read
 * it. {@link Json} is assignable to it, and so is a value declared
 * `as const`.
 */
export type ReadonlyJson = null | boolean | number | string | readonly ReadonlyJson[] | { readonly [property: string]: ReadonlyJson };
