import { Plugin } from "unified";
import { JsonDocumentNode } from "./jsonast.d.ts";
import { Replacer } from "./jsonast-util.js";


export type RejsonStringifyOptions = {
  replacer?: Replacer;
  space?: string;
};

/**
 * Stringifies a JSON AST to JSON. Includes {@link Replacer} and `space` options
 * similar to the standard
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify | JSON.stringify}
 * function.
 */
export const rejsonStringify: Plugin<[RejsonStringifyOptions?], JsonDocumentNode, string>;
