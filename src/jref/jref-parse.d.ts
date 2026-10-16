import type { Plugin } from "unified";
import type { JsonErrorNode, JsonParseStatus } from "../json/jsonast.d.ts";
import type { JrefDocumentNode, JrefTolerantNode } from "./jref-ast.d.ts";
import type { JsonOptions } from "../json/jsonast-util.d.ts";
import type { Reviver } from "./jref-util.js";

export type JrefParseOptions = JsonOptions & {
  reviver?: Reviver<JrefTolerantNode | undefined, JsonErrorNode>;
  /**
   * The worst parse status that doesn't fail the file. Every syntax error is
   * added to the file as a message either way. The document's `status` says
   * how the parse went. Defaults to `"success"`, so any syntax error fails the
   * file. A linter might accept `"failure"` to always get an AST.
   */
  accept?: JsonParseStatus;
};

/**
 * Parses JRef to a JRef AST. Includes {@link Reviver} option similar to the
 * standard
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}
 * function.
 */
export const jrefParse: Plugin<[JrefParseOptions?], string, JrefDocumentNode>;
