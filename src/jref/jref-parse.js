import { pathToUrl } from "#path-to-url";
import { reportSyntaxErrors } from "../json/report-syntax-errors.js";
import { fromJref, jrefSyntaxErrorMessage } from "./jref-util.js";

/**
 * @import { JrefDocumentNode } from "./jref-ast.js"
 * @import * as API from "./jref-parse.d.ts"
 */

/** @type typeof API.jrefParse */
export function jrefParse(options) {
  this.parser = function (document, file) {
    // A document's URL is its file's, so a file needs a path
    if (!file.path) {
      file.fail("A file needs a path, which is its document's URL");
    }
    const url = pathToUrl(file.cwd, file.path);

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
