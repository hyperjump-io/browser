import type { Processor } from "unified";
import type { JrefDocumentNode } from "./jref-ast.d.ts";

export const jref: Processor<JrefDocumentNode, undefined, undefined, JrefDocumentNode, string>;
