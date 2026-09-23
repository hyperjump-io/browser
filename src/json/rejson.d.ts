import type { Processor } from "unified";
import type { JsonDocumentNode } from "./jsonast.d.ts";

export const rejson: Processor<JsonDocumentNode, undefined, undefined, JsonDocumentNode, string>;
