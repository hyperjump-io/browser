import { reportSyntaxErrors } from "../json/report-syntax-errors.js";
import { fileUrl } from "../json/file-url.js";
import { fromJref, jrefSyntaxErrorMessage } from "./jref-util.js";

/**
 * @import * as API from "./jref-parse.d.ts"
 */

/** @type typeof API.jrefParse */
export function jrefParse(options) {
  this.parser = function (document, file) {
    const url = fileUrl(file, options?.url);

    const { document: tree, errors } = fromJref(document, url, options);
    reportSyntaxErrors(file, errors, jrefSyntaxErrorMessage, tree.status, options?.accept);
    return tree;
  };
}
