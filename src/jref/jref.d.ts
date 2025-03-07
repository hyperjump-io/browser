import { Processor } from "unified";
import { JrefDocumentNode } from "./jref-ast.d.ts";


export const jref: Processor<JrefDocumentNode, undefined, undefined, JrefDocumentNode, string>;
