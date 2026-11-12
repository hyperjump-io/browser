import type { Plugin } from "unified";
import type { JrefDocumentNode } from "./jref-ast.d.ts";
import type { ToJsonOptions } from "../json/jsonast-util.js";

/** The options of {@link toJson} */
export type JrefStringifyOptions = ToJsonOptions;

/** Stringifies a JRef AST to JRef. */
export const jrefStringify: Plugin<[JrefStringifyOptions?], JrefDocumentNode, string>;
