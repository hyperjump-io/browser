import { Plugin } from "unified";
import { JsonDocumentNode, JsonJsonNode } from "./jsonast.d.ts";
import { Reviver } from "./jsonast-util.d.ts";


export type JsonParseOptions = {
  location?: string;
  reviver?: Reviver<JsonJsonNode>;
};

/**
 * Parses JSON to a JSON AST. Includes {@link Reviver} option similar to the
 * standard
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}
 * function.
 */
export const rejsonParse: Plugin<[JsonParseOptions?], string, JsonDocumentNode>;
