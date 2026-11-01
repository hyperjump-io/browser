import { fromJson } from "./jsonast-util.js";
import { reportSyntaxErrors } from "./report-syntax-errors.js";

/**
 * @import { JsonDocumentNode } from "./jsonast.js"
 * @import * as API from "./rejson-parse.d.ts"
 */

/** @type API.rejsonParse */
export function rejsonParse(options) {
  this.parser = function (document, file) {
    const { status, node, errors, comments } = fromJson(document, options?.location, options);
    reportSyntaxErrors(file, errors, status, options?.accept);

    return /** @type JsonDocumentNode */ ({
      type: "json-document",
      status: status,
      children: node ? [node] : [],
      comments: comments
    });
  };
}
