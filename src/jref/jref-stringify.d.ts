import { Plugin } from "unified";
import { JrefDocumentNode } from "./jref-ast.d.ts";
import { Replacer } from "../json/jsonast-util.js";


export type JrefStringifyOptions = {
  replacer?: Replacer;
  space?: string;
};

/**
 * Stringifies a JRef AST to JRef. Includes {@link Replacer} and `space` options
 * similar to the standard
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify | JSON.stringify}
 * function.
 */
export const jrefStringify: Plugin<[JrefStringifyOptions?], JrefDocumentNode, string>;
