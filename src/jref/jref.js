import { unified } from "unified";
import { jrefParse } from "./jref-parse.js";
import { jrefStringify } from "./jref-stringify.js";

/**
 * @import { Processor } from "unified"
 * @import { JrefDocumentNode } from "./jref-ast.d.ts"
 */


/** @type Processor<JrefDocumentNode, undefined, undefined, JrefDocumentNode, string> */
// @ts-expect-error I don't know how to appease TS in this case
export const jref = unified()
  .use(jrefParse)
  .use(jrefStringify)
  .freeze();
