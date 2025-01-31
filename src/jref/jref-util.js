import { fromJson, pointerGet as jsonPointerGet, toJson } from "../json/jsonast-util.js";

/**
 * @import { JsonObjectNode } from "../json/jsonast.d.ts"
 * @import { JrefNode } from "./jref-ast.d.ts"
 */


/** @type (jref: string) => JrefNode */
export const fromJref = (jref) => {
  return fromJson(jref, (node) => {
    if (node.jsonType === "object") {
      const href = isReference(node);
      if (href) {
        return {
          type: "jref-reference",
          value: href,
          position: node.position
        };
      }
    }

    return node;
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

/** @type (node: JrefNode, replacer?: Replacer, space?: string) => string */
export const toJref = (node, replacer = defaultReplacer, space = "  ") => {
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
                value: node.value
              }
            ]
          }
        ]
      };
      return referenceNode;
    } else {
      return node;
    }
  }, space) + "\n";
};

export const pointerGet = /** @type (pointer: string, tree: JrefNode) => JrefNode */ (jsonPointerGet);
