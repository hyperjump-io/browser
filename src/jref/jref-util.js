import { resolveIri } from "@hyperjump/uri";
import { fromJson } from "../json/jsonast-util.js";

/**
 * @import {
 *   JsonNode
 * } from "../json/jsonast.d.ts"
 * @import {
 *   JrefJrefNode,
 *   JrefJrefReferenceNode,
 *   JrefNode
 * } from "./jref-ast.d.ts"
 * @import * as API from "./jref-util.d.ts"
 */


/** @type API.Reviver */
const defaultReviver = (value) => value;

/**
 * @overload
 * @param {string} jref
 * @param {string} uri
 * @returns {JrefJrefNode}
 *
 * @overload
 * @param {string} jref
 * @param {string} uri
 * @param {API.Reviver} reviver
 * @returns {JrefNode<any> | undefined}
 *
 * @param {string} jref
 * @param {string} uri
 * @param {API.Reviver} [reviver]
 * @returns {JrefJrefNode | JrefNode<any> | undefined}
 *
 * @type API.fromJref
 */
export const fromJref = (jref, uri, reviver = defaultReviver) => {
  return fromJson(jref, (node, key) => {
    const jrefNode = /** @type JsonNode<JrefJrefNode> */ (node);

    const returned = { uri: "" };
    if (isReference(jrefNode, returned)) {
      jrefNode.jrefType = "jref-reference";
      jrefNode.href = resolveIri(returned.uri, uri);
      jrefNode.documentUri = uri;
    }

    node.type = "jref";
    return reviver(node, key);
  });
};

/** @type (node: JsonNode<JrefJrefNode>, returned: { uri: string }) => node is JrefJrefReferenceNode */
const isReference = (node, returned) => {
  if (node.jsonType === "object") {
    for (const propertyNode of node.children) {
      if (propertyNode.children[0].value === "$ref") {
        const valueNode = propertyNode.children[1];
        if (valueNode.jsonType === "string") {
          returned.uri = valueNode.value;
          return true;
        }
      }
    }
  }

  return false;
};
