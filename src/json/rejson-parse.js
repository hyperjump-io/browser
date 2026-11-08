import { pathToUri } from "#path-to-uri";
import { fromJson, jsonSyntaxErrorMessage } from "./jsonast-util.js";
import { reportSyntaxErrors } from "./report-syntax-errors.js";

/**
 * @import { JsonDocumentNode } from "./jsonast.js"
 * @import * as API from "./rejson-parse.d.ts"
 */

/** @type typeof API.rejsonParse */
export function rejsonParse(options) {
  this.parser = function (document, file) {
    const uri = file.path ? pathToUri(file.cwd, file.path) : undefined;

    const { status, node, errors, comments } = fromJson(document, uri, options);
    reportSyntaxErrors(file, errors, jsonSyntaxErrorMessage, status, options?.accept);

    /** @type JsonDocumentNode */
    const tree = {
      type: "json-document",
      status: status,
      children: node ? [node] : [],
      comments: comments,
      uri: uri
    };
    return tree;
  };
}
