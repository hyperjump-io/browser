import { hasStatus as jsonHasStatus, jsonSyntaxErrorMessage } from "../json/jsonast-util.js";
import { parseJson } from "../json/json-parser.js";
import { parseDocumentUrl } from "../hyperjump/url-parts.js";

/**
 * @import { JsonErrorNode, JsonTolerantNode } from "../json/jsonast.js"
 * @import { JsonParseResult, JsonSyntaxError } from "../json/jsonast-util.js"
 * @import { JrefErrorNode, JrefNode, JrefTolerantNode } from "./jref-ast.d.ts"
 * @import * as API from "./jref-util.d.ts"
 */

// eslint-disable-next-line @stylistic/no-extra-parens
export const hasStatus = /** @type typeof API.hasStatus */ (jsonHasStatus);

/** @type typeof API.fromJref */
export const fromJref = (jref, url, options = {}) => {
  const documentUrl = parseDocumentUrl(url);
  const result = parseJson(jref, documentUrl, options);

  /** @type API.JrefSyntaxError[] */
  const referenceErrors = [];
  annotateReferences(result.node, documentUrl, referenceErrors);
  if (referenceErrors.length === 0) {
    return result;
  }

  // Both lists are in document order, and so is their merge
  const errors = [...result.errors, ...referenceErrors]
    .sort((a, b) => a.place.start.line - b.place.start.line || a.place.start.column - b.place.start.column);

  // The status is what decides the type of the node, which is checked by the
  // tests rather than the type system
  return /** @type JsonParseResult<JrefNode, JrefTolerantNode | JrefErrorNode, JsonSyntaxError | API.JrefSyntaxError> */ ({
    ...result,
    status: "failure",
    errors
  });
};

/** @type typeof API.jrefSyntaxErrorMessage */
export const jrefSyntaxErrorMessage = (error) => error.source === "jref"
  ? `'${error.actual}' is not a valid reference`
  : jsonSyntaxErrorMessage(error);

/**
 * Make every object with a string `$ref` a reference, or an invalid
 * reference with an error in `errors`.
 *
 * @type (node: JsonTolerantNode | JsonErrorNode, url: string, errors: API.JrefSyntaxError[]) => void
 */
const annotateReferences = (node, url, errors) => {
  if (!("jsonType" in node)) {
    return;
  }

  if (node.jsonType === "array") {
    for (const item of node.children) {
      annotateReferences(item, url, errors);
    }
  } else if (node.jsonType === "object") {
    let isReference = false;
    for (const propertyNode of node.children) {
      const [keyNode, valueNode] = propertyNode.children;
      if (!isReference && keyNode.value === "$ref" && "jsonType" in valueNode && valueNode.jsonType === "string") {
        const href = resolveReference(valueNode.value, url);
        if (href === undefined) {
          Object.assign(node, { type: "invalid-reference" });
          errors.push({
            source: "jref",
            ruleId: "invalid-reference",
            // fromJson gives every node a position
            place: /** @type NonNullable<typeof valueNode.position> */ (valueNode.position),
            actual: valueNode.value
          });
        } else {
          Object.assign(node, { type: "reference", href });
        }
        isReference = true;
      }
      annotateReferences(valueNode, url, errors);
    }
  }
};

/**
 * The reference resolved against the document's URL, or `undefined` if it
 * isn't a URL, like `b` against `urn:example:a`
 *
 * @type (reference: string, url: string) => string | undefined
 */
const resolveReference = (reference, url) => URL.parse(reference, url)?.href;
