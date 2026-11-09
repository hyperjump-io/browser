import { pathToUrl } from "#path-to-url";
import { fromJson, jsonSyntaxErrorMessage } from "./jsonast-util.js";
import { reportSyntaxErrors } from "./report-syntax-errors.js";

/**
 * @import { JsonDocumentNode } from "./jsonast.js"
 * @import * as API from "./rejson-parse.d.ts"
 */

/** @type typeof API.rejsonParse */
export function rejsonParse(options) {
  this.parser = function (document, file) {
    // A document's URL is its file's, so a file needs a path
    if (!file.path) {
      file.fail("A file needs a path, which is its document's URL");
    }
    const url = pathToUrl(file.cwd, file.path);

    const { status, node, errors, comments } = fromJson(document, url, options);
    reportSyntaxErrors(file, errors, jsonSyntaxErrorMessage, status, options?.accept);

    /** @type JsonDocumentNode */
    const tree = {
      type: "json-document",
      status: status,
      children: node ? [node] : [],
      comments: comments,
      url: url
    };
    return tree;
  };
}
