import { fromJson, jsonSyntaxErrorMessage } from "./jsonast-util.js";
import { reportSyntaxErrors } from "./report-syntax-errors.js";
import { fileUrl } from "./file-url.js";

/**
 * @import * as API from "./rejson-parse.d.ts"
 */

/** @type typeof API.rejsonParse */
export function rejsonParse(options) {
  this.parser = function (document, file) {
    const url = fileUrl(file, options?.url);

    const { document: tree, errors } = fromJson(document, url, options);
    reportSyntaxErrors(file, errors, jsonSyntaxErrorMessage, tree.status, options?.accept);
    return tree;
  };
}
