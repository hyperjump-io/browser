import type { Plugin } from "unified";
import type { JsonDocumentNode, JsonNode } from "./jsonast.d.ts";
import type { Reviver } from "./jsonast-util.d.ts";

export type JsonParseOptions = {
  location?: string;
  reviver?: Reviver<JsonNode, JsonNode | undefined>;
};

/**
 * Parses JSON to a JSON AST. Includes {@link Reviver} option similar to the
 * standard
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}
 * function.
 */
export const rejsonParse: Plugin<[JsonParseOptions?], string, JsonDocumentNode>;
