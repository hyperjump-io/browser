import type { Position } from "unist";
import type { JsonDocumentNode, JsonParseStatus } from "../json/jsonast.d.ts";
import type { JsonOptions, JsonParseResult, JsonSyntaxError } from "../json/jsonast-util.d.ts";
import type { JrefDocumentNode } from "./jref-ast.d.ts";

/**
 * Parse a JRef string into a JRef document, whose root is the AST of the
 * value. It has `anchors`, so it says what its fragments identify. It's the
 * document the `jref*` functions read, and that the JRef media type and
 * `jrefParse` make.
 *
 * References are resolved against `url`, the document's URL.
 *
 * Nothing in the document makes it throw. The result works the same way as
 * the result of `fromJson`. A `$ref` that isn't a valid reference is a
 * {@link JrefSyntaxError}, and its object is a `JrefInvalidReferenceNode`,
 * so the status is `failure`.
 *
 * @throws {TypeError} If `url` isn't a URL or has a fragment. It's the
 *   caller's mistake, not the document's.
 */
export const fromJref: (json: string, url: string, options?: JsonOptions) => JsonParseResult<JrefDocumentNode, JsonSyntaxError | JrefSyntaxError>;

/**
 * An error in JRef that's valid JSON. It's plain data, like a
 * {@link JsonSyntaxError}. Use {@link jrefSyntaxErrorMessage} to describe
 * it.
 */
export type JrefSyntaxError = {
  source: "jref";

  /**
   * - `invalid-reference`: a `$ref` that doesn't resolve to a URL against
   *   the document's URL
   * - `absolute-file-reference`: a `$ref` that's a `file:` URL by itself,
   *   like `file:///home/me/a.json`. It says where files are on a machine,
   *   so a file is referred to with a relative reference.
   */
  ruleId: "invalid-reference" | "absolute-file-reference";

  /** The span of the `$ref`'s value */
  place: Position;

  /** The `$ref`'s value */
  actual: string;
} | {
  source: "jref";

  /**
   * `duplicate-reference`: an object with more than one `$ref`, which is
   * ambiguous, whatever their values are
   */
  ruleId: "duplicate-reference";

  /** The span of the second `$ref`'s name */
  place: Position;

  /** There's no one value it's about */
  actual?: undefined;
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
