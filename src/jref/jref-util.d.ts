import type { InvalidIriError } from "@hyperjump/uri";
import type { Position } from "unist";
import type { JsonDocumentNode, JsonParseStatus } from "../json/jsonast.d.ts";
import type { JsonOptions, JsonParseResult, JsonSyntaxError } from "../json/jsonast-util.d.ts";
import type { JrefDocumentNode, JrefErrorNode, JrefNode, JrefTolerantNode } from "./jref-ast.d.ts";

/**
 * Parse a JRef string into a JRef AST.
 *
 * References are resolved against `uri`. If `uri` is not given, references are
 * left as written.
 *
 * Nothing in the document makes it throw. The result works the same way as
 * the result of `fromJson`. A `$ref` that isn't a valid reference is a
 * {@link JrefSyntaxError}, and its object is a `JrefInvalidReferenceNode`,
 * so the status is `failure`.
 *
 * @throws {InvalidIriError} If `uri` isn't an absolute IRI. It's the
 *   caller's mistake, not the document's.
 */
export const fromJref: (json: string, uri?: string, options?: JsonOptions) => JsonParseResult<JrefNode, JrefTolerantNode | JrefErrorNode, JsonSyntaxError | JrefSyntaxError>;

/**
 * An error in JRef that's valid JSON. It's plain data, like a
 * {@link JsonSyntaxError}. Use {@link jrefSyntaxErrorMessage} to describe
 * it.
 */
export type JrefSyntaxError = {
  source: "jref";

  /**
   * - `invalid-reference`: a `$ref` that isn't an IRI-reference, or that
   *   doesn't resolve to a valid IRI against the document's URI
   */
  ruleId: "invalid-reference";

  /** The span of the `$ref`'s value */
  place: Position;

  /** The `$ref`'s value */
  actual: string;
};

/**
 * A description of an error from {@link fromJref} for people. It describes
 * a {@link JsonSyntaxError} the way `jsonSyntaxErrorMessage` does.
 */
export const jrefSyntaxErrorMessage: (error: JsonSyntaxError | JrefSyntaxError) => string;

/**
 * Check a document's parse status and narrow its type. This is the same
 * function as the JSON `hasStatus`, extended to JRef documents.
 */
export const hasStatus: {
  <S extends JsonParseStatus>(document: JrefDocumentNode, status: S, ...statuses: S[]): document is JrefDocumentNode<S>;
  <S extends JsonParseStatus>(document: JsonDocumentNode, status: S, ...statuses: S[]): document is JsonDocumentNode<S>;
};
