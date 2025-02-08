import { resolveIri, toRelativeIri } from "@hyperjump/uri";
import {
  fromJson,
  pointerGet as jsonPointerGet,
  pointerStep as jsonPointerStep,
  toJson
} from "../json/jsonast-util.js";

/**
 * @import { JsonObjectNode } from "../json/jsonast.d.ts"
 * @import { JrefNode } from "./jref-ast.d.ts"
 */


/**
 * @template [A = JrefNode]
 * @typedef {(node: JrefNode, key?: string) => A | undefined} Reviver
 */

/** @type Reviver<any> */
const defaultReviver = (value) => value;

/** @type (jref: string, uri: string, reviver?: Reviver) => JrefNode | undefined */
export const fromJref = (jref, uri, reviver = defaultReviver) => {
  return fromJson(jref, (node, key) => {
    /** @type JrefNode */
    let jrefNode = node;

    if (node.jsonType === "object") {
      const href = isReference(node);
      if (href) {
        jrefNode = {
          type: "jref-reference",
          value: resolveIri(href, uri),
          documentUri: uri,
          position: node.position
        };
      }
    }

    return reviver(jrefNode, key);
  });
};

/** @type (node: JsonObjectNode<JrefNode>) => string | undefined */
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

/**
 * @typedef {(key: string | undefined, value: JrefNode) => JrefNode} Replacer
 */

/** @type Replacer */
const defaultReplacer = (_key, node) => node;

/** @type (node: JrefNode, uri: string, replacer?: Replacer, space?: string) => string */
export const toJref = (node, uri, replacer = defaultReplacer, space = "  ") => {
  return toJson(node, (key, node) => {
    node = replacer.call(this, key, node);

    if (node.type === "jref-reference") {
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
                value: toRelativeIri(uri, node.value)
              }
            ]
          }
        ]
      };
      return referenceNode;
    } else {
      return node;
    }
  }, space);
};

export const pointerGet = /** @type (pointer: string, tree: JrefNode, documentUri?: string) => JrefNode */ (jsonPointerGet);
export const pointerStep = /** @type (segment: string, tree: JrefNode, uri?: string) => JrefNode */ (jsonPointerStep);
