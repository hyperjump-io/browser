import type { JsonDocumentNode, JsonErrorNode, JsonParseStatus } from "../json/jsonast.d.ts";
import type { JsonOptions, JsonParseResult } from "../json/jsonast-util.d.ts";
import type { JrefDocumentNode, JrefNode, JrefTolerantNode } from "./jref-ast.d.ts";

export type Reviver<A extends JrefNode<X> | undefined, X = never> = (node: JrefNode<X>, key?: string) => A;

/**
 * Parse a JRef string into a JRef AST. Includes a reviver option similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}.
 *
 * References are resolved against `uri`. If `uri` is not given, references are
 * left as written.
 *
 * Parsing never throws. The result works the same way as the result of
 * `fromJson`.
 */
export const fromJref: <A extends JrefTolerantNode | undefined = JrefTolerantNode>(json: string, uri?: string, reviver?: Reviver<A, JsonErrorNode>, options?: JsonOptions) => JsonParseResult<JrefNode | Extract<A, undefined>, A | JsonErrorNode>;

/**
 * Check a document's parse status and narrow its type. This is the same
 * function as the JSON `hasStatus`, extended to JRef documents.
 */
export const hasStatus: {
  <S extends JsonParseStatus>(document: JrefDocumentNode, status: S, ...statuses: S[]): document is JrefDocumentNode<S>;
  <S extends JsonParseStatus>(document: JsonDocumentNode, status: S, ...statuses: S[]): document is JsonDocumentNode<S>;
};
