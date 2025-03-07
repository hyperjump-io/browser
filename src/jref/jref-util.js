import { resolveIri, toRelativeIri } from "@hyperjump/uri";
import {
  fromJson,
  pointerGet as jsonPointerGet,
  pointerStep as jsonPointerStep,
  toJson
} from "../json/jsonast-util.js";

/**
 * @import { JsonObjectNode } from "../json/jsonast.js"
 * @import { JrefNode } from "./jref-ast.js"
 * @import * as API from "./jref-util.d.ts"
 */


/** @type API.Reviver<any> */
const defaultReviver = (value) => value;

/** @type API.fromJref */
export const fromJref = (jref, uri, reviver = defaultReviver) => {
  return fromJson(jref, (node, key) => {
    if (node.jsonType === "object") {
      const href = isReference(node);
      if (href) {
        return reviver({
          type: "jref-reference",
          value: resolveIri(href, uri),
          documentUri: uri,
          position: node.position
        }, key);
      }
    }

    return reviver(node, key);
  });
};

/** @type <A extends JrefNode>(node: JsonObjectNode<A>) => string | undefined */
const isReference = (objectNode) => {
  for (const propertyNode of objectNode.children) {
    if (propertyNode.children[0].value === "$ref") {
      const valueNode = propertyNode.children[1];
      if (valueNode.type === "json" && valueNode.jsonType === "string") {
        return valueNode.value;
      }
    }
  }
};

/** @type API.Replacer */
const defaultReplacer = (node) => node;

/** @type API.toJref */
export const toJref = (node, uri, replacer = defaultReplacer, space = "") => {
  return toJson(node, (node, key) => {
    const replacedNode = replacer(node, key);

    if (!replacedNode) {
      return;
    } else if (replacedNode.type === "jref-reference") {
      /** @type JsonObjectNode<JrefNode> */
      const referenceNode = {
        type: "json",
        jsonType: "object",
        children: [
          {
            type: "json-property",
            children: [
              {
                type: "json-property-name",
                value: "$ref"
              },
              {
                type: "json",
                jsonType: "string",
                value: toRelativeIri(uri, replacedNode.value)
              }
            ]
          }
        ]
      };
      return referenceNode;
    } else {
      return replacedNode;
    }
  }, space);
};

export const pointerStep = /** @type API.pointerStep */ (jsonPointerStep);

export const pointerGet = /** @type API.pointerGet */ (jsonPointerGet);
