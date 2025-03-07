import { unified } from "unified";
import { rejsonParse } from "./rejson-parse.js";
import { rejsonStringify } from "./rejson-stringify.js";

/**
 * @import { Processor } from "unified"
 * @import * as API from "./rejson.d.ts"
 */


/** @type API.rejson */
export const rejson = /** @type Processor<any, any, any, any, any> */ (unified()
  .use(rejsonParse)
  .use(rejsonStringify)
  .freeze());
