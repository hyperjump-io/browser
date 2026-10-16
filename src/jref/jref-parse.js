import { pathToUri } from "#path-to-uri";
import { reportSyntaxErrors } from "../json/report-syntax-errors.js";
import { fromJref } from "./jref-util.js";

/**
 * @import { JrefDocumentNode } from "./jref-ast.js"
 * @import * as API from "./jref-parse.d.ts"
 */

/** @type API.jrefParse */
export function jrefParse(options) {
  this.parser = function (document, file) {
    const uri = file.path ? pathToUri(file.cwd, file.path) : undefined;

    const { status, node, messages, comments } = fromJref(document, uri, options?.reviver, options);
    reportSyntaxErrors(file, messages, status, options?.accept);

    return /** @type JrefDocumentNode */ ({
      type: "jref-document",
      status: status,
      children: node ? [node] : [],
      comments: comments,
      uri: uri,
      fragmentKind: "json-pointer"
    });
  };
}
