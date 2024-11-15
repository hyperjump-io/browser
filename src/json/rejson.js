import { unified } from "unified";
import { rejsonParse } from "./rejson-parse.js";
import { rejsonStringify } from "./rejson-stringify.js";

/**
 * @import { Processor } from "unified"
 * @import { JsonDocumentNode } from "./jsonast.d.ts"
 */


/** @type Processor<JsonDocumentNode, undefined, undefined, JsonDocumentNode, string> */
// @ts-expect-error I don't know how to appease TS in this case
export const rejson = unified()
  .use(rejsonParse)
  .use(rejsonStringify)
  .freeze();
