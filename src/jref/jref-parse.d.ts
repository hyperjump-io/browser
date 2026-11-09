import type { Plugin } from "unified";
import type { JsonParseStatus } from "../json/jsonast.d.ts";
import type { JrefDocumentNode } from "./jref-ast.d.ts";
import type { JsonOptions } from "../json/jsonast-util.d.ts";

export type JrefParseOptions = JsonOptions & {
  /**
   * The worst parse status that doesn't fail the file. Every syntax error is
   * added to the file as a message either way. The document's `status` says
   * how the parse went. Defaults to `"success"`, so any syntax error fails the
   * file. A linter might accept `"failure"` to always get an AST.
   */
  accept?: JsonParseStatus;
};

/** Parses JRef to a JRef AST. A file needs a path, which is the
 * document's URL, or the parse fails. */
export const jrefParse: Plugin<[JrefParseOptions?], string, JrefDocumentNode>;
