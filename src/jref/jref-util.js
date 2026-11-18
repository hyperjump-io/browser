import { hasStatus as jsonHasStatus, jsonSyntaxErrorMessage } from "../json/jsonast-util.js";
import { parseJson } from "../json/json-parser.js";
import { parseDocumentUrl } from "../json/document-url.js";

/**
 * @import { JsonErrorNode, JsonTolerantNode } from "../json/jsonast.js"
 * @import { JrefDocumentNode } from "./jref-ast.d.ts"
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

  // Both lists are in document order, and so is their merge
  const errors = referenceErrors.length === 0
    ? result.errors
    : [...result.errors, ...referenceErrors]
        .sort((a, b) => a.place.start.line - b.place.start.line || a.place.start.column - b.place.start.column);

  // The status is what decides the type of the children, which is checked
  // by the tests rather than the type system
  const document = /** @type JrefDocumentNode */ ({
    type: "jref-document",
    status: referenceErrors.length === 0 ? result.status : "failure",
    children: [result.node],
    comments: result.comments,
    url: documentUrl,
    anchors: {}
  });
  return { document, errors };
};

/** @type typeof API.jrefSyntaxErrorMessage */
export const jrefSyntaxErrorMessage = (error) => {
  if (error.source !== "jref") {
    return jsonSyntaxErrorMessage(error);
  }
  // The URL says where files are on a machine, so the message doesn't say it
  switch (error.ruleId) {
    case "absolute-file-reference":
      return "A reference can't be an absolute file: URL. Use a relative reference to refer to a file.";
    case "duplicate-reference":
      return "An object can't have more than one '$ref'";
    default:
      return `'${error.actual}' is not a valid reference`;
  }
};

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
    // More than one `$ref` is ambiguous, as a JSON Pointer to a name that's
    // there more than once is, and readers of JSON don't agree on which wins
    const refs = node.children.filter((propertyNode) => propertyNode.children[0].value === "$ref");
    if (refs.length > 1) {
      Object.assign(node, { type: "invalid-reference" });
      errors.push({
        source: "jref",
        ruleId: "duplicate-reference",
        place: /** @type NonNullable<typeof node.position> */ (refs[1].children[0].position)
      });
    }

    for (const propertyNode of node.children) {
      const [keyNode, valueNode] = propertyNode.children;
      if (refs.length === 1 && keyNode.value === "$ref" && "jsonType" in valueNode && valueNode.jsonType === "string") {
        const href = resolveReference(valueNode.value, url);
        const absoluteFile = isAbsoluteFileUrl(valueNode.value);
        if (href === undefined || absoluteFile) {
          Object.assign(node, { type: "invalid-reference" });
          errors.push({
            source: "jref",
            ruleId: absoluteFile ? "absolute-file-reference" : "invalid-reference",
            // fromJson gives every node a position
            place: /** @type NonNullable<typeof valueNode.position> */ (valueNode.position),
            actual: valueNode.value
          });
        } else {
          Object.assign(node, { type: "reference", href });
        }
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

/**
 * Whether a reference is a `file:` URL by itself, not one that's relative to
 * a file. A document that has one says where files are on the machine it
 * was written on, wherever it goes.
 *
 * @type (reference: string) => boolean
 */
const isAbsoluteFileUrl = (reference) => URL.parse(reference)?.protocol === "file:";
