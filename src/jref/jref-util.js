import { resolveIri } from "@hyperjump/uri";
import { fromJson, hasStatus as jsonHasStatus } from "../json/jsonast-util.js";

/**
 * @import { JsonErrorNode, JsonTolerantNode } from "../json/jsonast.js"
 * @import * as API from "./jref-util.d.ts"
 */

// eslint-disable-next-line @stylistic/no-extra-parens
export const hasStatus = /** @type typeof API.hasStatus */ (jsonHasStatus);

/** @type typeof API.fromJref */
export const fromJref = (jref, uri, options = {}) => {
  const result = fromJson(jref, uri, options);
  annotateReferences(result.node, uri);

  return result;
};

/**
 * Make every object with a string `$ref` a reference.
 *
 * @type (node: JsonTolerantNode | JsonErrorNode, uri: string | undefined) => void
 */
const annotateReferences = (node, uri) => {
  if (!("jsonType" in node)) {
    return;
  }

  if (node.jsonType === "array") {
    for (const item of node.children) {
      annotateReferences(item, uri);
    }
  } else if (node.jsonType === "object") {
    let isReference = false;
    for (const propertyNode of node.children) {
      const [keyNode, valueNode] = propertyNode.children;
      if (!isReference && keyNode.value === "$ref" && "jsonType" in valueNode && valueNode.jsonType === "string") {
        Object.assign(node, {
          type: "reference",
          // Without a base URI, relative references can't be resolved
          href: uri === undefined ? valueNode.value : resolveIri(valueNode.value, uri)
        });
        isReference = true;
      }
      annotateReferences(valueNode, uri);
    }
  }
};
