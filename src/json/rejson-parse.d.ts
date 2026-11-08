import type { Plugin } from "unified";
import type { JsonDocumentNode, JsonParseStatus } from "./jsonast.d.ts";
import type { JsonOptions } from "./jsonast-util.d.ts";

export type JsonParseOptions = JsonOptions & {
  /**
   * The worst parse status that doesn't fail the file. Every syntax error is
   * added to the file as a message either way. The document's `status` says
   * how the parse went. Defaults to `"success"`, so any syntax error fails the
   * file. A linter might accept `"failure"` to always get an AST.
   */
  accept?: JsonParseStatus;
};

/** Parses JSON to a JSON AST. */
export const rejsonParse: Plugin<[JsonParseOptions?], string, JsonDocumentNode>;
