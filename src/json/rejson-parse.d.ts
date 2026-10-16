import type { Plugin } from "unified";
import type { JsonDocumentNode, JsonErrorNode, JsonNode, JsonParseStatus } from "./jsonast.d.ts";
import type { JsonOptions, Reviver } from "./jsonast-util.d.ts";

export type JsonParseOptions = JsonOptions & {
  location?: string;
  reviver?: Reviver<JsonNode, JsonNode<JsonNode, JsonErrorNode> | undefined, JsonErrorNode>;
  /**
   * The worst parse status that doesn't fail the file. Every syntax error is
   * added to the file as a message either way. The document's `status` says
   * how the parse went. Defaults to `"success"`, so any syntax error fails the
   * file. A linter might accept `"failure"` to always get an AST.
   */
  accept?: JsonParseStatus;
};

/**
 * Parses JSON to a JSON AST. Includes {@link Reviver} option similar to the
 * standard
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}
 * function.
 */
export const rejsonParse: Plugin<[JsonParseOptions?], string, JsonDocumentNode>;
