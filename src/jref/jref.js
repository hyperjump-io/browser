import { unified } from "unified";
import { jrefParse } from "./jref-parse.js";
import { jrefStringify } from "./jref-stringify.js";

/**
 * @import { Processor } from "unified"
 * @import * as API from "./jref.d.ts"
 */


/** @type API.jref */
export const jref = /** @type Processor<any, any, any, any, any> */ (unified()
  .use(jrefParse)
  .use(jrefStringify)
  .freeze());
