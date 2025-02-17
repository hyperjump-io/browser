import { resolveIri, toRelativeIri } from "@hyperjump/uri";
import {
  fromJson,
  pointerGet as jsonPointerGet,
  pointerStep as jsonPointerStep,
  toJson
} from "../json/jsonast-util.js";

/**
 * @import { JsonObjectNode } from "../json/jsonast.js"
 * @import { JrefCompatible, JrefNode } from "./jref-ast.js"
 */


/**
 * @template {JrefNode | undefined} A
 * @typedef {(node: JrefCompatible<NonNullable<A>>, key?: string) => A} Reviver
 */

/** @type Reviver<any> */
const defaultReviver = (value) => value;

/**
 * Parse a JRef string into a JRef AST. Includes a reviver option similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}.
 *
 * @type <A extends JrefNode | undefined = JrefNode>(jref: string, uri: string, reviver?: Reviver<A>) => A
 */
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

/**
 * @typedef {(value: JrefNode, key?: string) => JrefNode | undefined} Replacer
 */

/** @type Replacer */
const defaultReplacer = (node) => node;

/**
 * Stringify a JrefNode to a JRef string. Includes options for a
 * {@link Replacer} and `space` like
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify | JSON.stringify}.
 *
 * @type (node: JrefNode, uri: string, replacer?: Replacer, space?: string) => string
 */
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

/**
 * Index into an object or array JsonNode. Reference nodes are not followed.
 */
export const pointerStep = /** @type (segment: string, tree: JrefNode, uri?: string) => JrefNode */ (jsonPointerStep);

/**
 * Get a JrefNode using a JSON Pointer. Reference nodes are not followed.
 */
export const pointerGet = /** @type (pointer: string, tree: JrefNode, documentUri?: string) => JrefNode */ (jsonPointerGet);
