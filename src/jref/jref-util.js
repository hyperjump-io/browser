import { fromJson, pointerGet as jsonPointerGet } from "../json/jsonast-util.js";

/**
 * @import {
 *   JsonArrayNode,
 *   JsonObjectNode
 * } from "../json/jsonast.d.ts"
 * @import {
 *   JrefDocumentNode,
 *   JrefNode
 * } from "./jref-ast.d.ts"
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

/** @type (tree: JrefDocumentNode, space?: string) => string */
export const toJref = (tree, space = "  ") => {
  return stringifyValue(tree.children[0], space, 1) + "\n";
};

/** @type (node: JrefNode, space: string, depth: number) => string */
const stringifyValue = (node, space, depth) => {
  if (node.type === "jref-reference") {
    const buffer = space ? " " : "";
    return `{${buffer}"$ref":${buffer}${JSON.stringify(node.value)}${buffer}}`;
  } else if (node.jsonType === "array") {
    return stringifyArray(node, space, depth);
  } else if (node.jsonType === "object") {
    return stringifyObject(node, space, depth);
  } else {
    return JSON.stringify(node.value);
  }
};

/** @type (node: JsonArrayNode<JrefNode>, space: string, depth: number) => string */
const stringifyArray = (node, space, depth) => {
  if (node.children.length === 0) {
    return "[]";
  }

  const padding = space ? `\n${space.repeat(depth - 1)}` : "";

  let result = "[" + padding + space;
  for (let index = 0; index < node.children.length; index++) {
    const stringifiedValue = stringifyValue(node.children[index], space, depth + 1);
    result += stringifiedValue ?? "null";
    if (index + 1 < node.children.length) {
      result += `,${padding}${space}`;
    }
  }
  return result + padding + "]";
};

/** @type (node: JsonObjectNode<JrefNode>, space: string, depth: number) => string */
const stringifyObject = (node, space, depth) => {
  if (node.children.length === 0) {
    return "{}";
  }

  const padding = space ? `\n${space.repeat(depth - 1)}` : "";
  const colonSpacing = space ? " " : "";

  let result = "{" + padding + space;
  for (let index = 0; index < node.children.length; index++) {
    const propertyNode = node.children[index];
    const [keyNode, valueNode] = propertyNode.children;
    const stringifiedValue = stringifyValue(valueNode, space, depth + 1);
    if (stringifiedValue !== undefined) {
      result += JSON.stringify(keyNode.value) + ":" + colonSpacing + stringifiedValue;
      if (node.children[index + 1]) {
        result += `,${padding}${space}`;
      }
    }
  }
  return result + padding + "}";
};

export const pointerGet = /** @type (pointer: string, tree: JrefNode) => JrefNode */ (jsonPointerGet);
