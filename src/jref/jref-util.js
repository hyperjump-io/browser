import { hasStatus as jsonHasStatus, jsonSyntaxErrorMessage } from "../json/jsonast-util.js";
import { parseJson } from "../json/json-parser.js";
import { parseDocumentUrl } from "../json/document-url.js";

/**
 * @import { JsonTolerantObjectNode } from "../json/json-parser.js"
 * @import { JrefDocumentNode } from "./jref-ast.d.ts"
 * @import * as API from "./jref-util.d.ts"
 */

// eslint-disable-next-line @stylistic/no-extra-parens
export const hasStatus = /** @type typeof API.hasStatus */ (jsonHasStatus);

/** @type typeof API.fromJref */
export const fromJref = (jref, url, options = {}) => {
  const documentUrl = parseDocumentUrl(url);
  /** @type API.JrefSyntaxError[] */
  const referenceErrors = [];
  const result = parseJson(jref, documentUrl, options, (node) => {
    annotateReference(node, documentUrl, referenceErrors);
  });

  // The reference errors are found inner objects first, so they're sorted
  // into document order with the others
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
 * Make an object with a string `$ref` a reference, or an invalid reference
 * with an error in `errors`.
 *
 * @type (node: JsonTolerantObjectNode, url: string, errors: API.JrefSyntaxError[]) => void
 */
const annotateReference = (node, url, errors) => {
  // More than one `$ref` is ambiguous, as a JSON Pointer to a name that's
  // there more than once is, and readers of JSON don't agree on which wins.
  // They're counted without a list, since almost every object has none.
  let refs = 0;
  for (const propertyNode of node.children) {
    if (propertyNode.children[0].value === "$ref" && ++refs === 2) {
      Object.assign(node, { type: "invalid-reference" });
      errors.push({
        source: "jref",
        ruleId: "duplicate-reference",
        place: /** @type NonNullable<typeof node.position> */ (propertyNode.children[0].position)
      });
    }
  }
  if (refs !== 1) {
    return;
  }

  for (const propertyNode of node.children) {
    const keyNode = propertyNode.children[0];
    const valueNode = propertyNode.children[1];
    if (keyNode.value === "$ref" && "jsonType" in valueNode && valueNode.jsonType === "string") {
      const href = resolveReference(valueNode.value, url);
      // An absolute file: URL resolves to one, so the reference is parsed
      // again only for a reference that resolves to one
      const absoluteFile = href?.startsWith("file:") === true && isAbsoluteFileUrl(valueNode.value);
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
