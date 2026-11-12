import { reportSyntaxErrors } from "../json/report-syntax-errors.js";
import { fileUrl } from "../json/file-url.js";
import { fromJref, jrefSyntaxErrorMessage } from "./jref-util.js";

/**
 * @import { JrefDocumentNode } from "./jref-ast.js"
 * @import * as API from "./jref-parse.d.ts"
 */

/** @type typeof API.jrefParse */
export function jrefParse(options) {
  this.parser = function (document, file) {
    const url = fileUrl(file, options?.url);

    const { status, node, errors, comments } = fromJref(document, url, options);
    reportSyntaxErrors(file, errors, jrefSyntaxErrorMessage, status, options?.accept);

    /** @type JrefDocumentNode */
    const tree = {
      type: "jref-document",
      status: status,
      children: node ? [node] : [],
      comments: comments,
      url: url
    };
    return tree;
  };
}
