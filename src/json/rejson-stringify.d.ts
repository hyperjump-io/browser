import type { Plugin } from "unified";
import type { JsonDocumentNode } from "./jsonast.d.ts";
import type { ToJsonOptions } from "./jsonast-util.js";

/** The options of {@link toJson} */
export type RejsonStringifyOptions = ToJsonOptions;

/** Stringifies a JSON AST to JSON. */
export const rejsonStringify: Plugin<[RejsonStringifyOptions?], JsonDocumentNode, string>;
