import { Plugin } from "unified";
import { JrefDocumentNode, JrefNode } from "./jref-ast.d.ts";
import { Reviver } from "./jref-util.js";


export type JrefParseOptions = {
  reviver?: Reviver<JrefNode | undefined>;
};

/**
 * Parses JRef to a JRef AST. Includes {@link Reviver} option similar to the
 * standard
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}
 * function.
 */
export const jrefParse: Plugin<[JrefParseOptions?], string, JrefDocumentNode>;
