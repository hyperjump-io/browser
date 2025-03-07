import { Processor } from "unified";
import { JsonDocumentNode } from "./jsonast.d.ts";


export const rejson: Processor<JsonDocumentNode, undefined, undefined, JsonDocumentNode, string>;
