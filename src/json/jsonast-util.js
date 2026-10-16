import * as JsonPointer from "@hyperjump/json-pointer";
import { parseJson } from "./json-parser.js";

/**
 * @import {
 *   JsonArrayNode,
 *   JsonInvalidNode,
 *   JsonNode,
 *   JsonObjectNode,
 *   JsonPropertyNameNode,
 *   JsonErrorNode,
 *   JsonPropertyNode
 * } from "./jsonast.js"
 * @import * as API from "./jsonast-util.d.ts"
 */

/** @type API.Reviver<object, any, any> */
const defaultReviver = (value) => value;

/** @type API.fromJson */
export const fromJson = (json, location = "", reviver = defaultReviver, options = {}) => {
  return parseJson(json, location, reviver, options);
};

/** @type API.hasStatus */
export const hasStatus = (document, ...statuses) => {
  return /** @type string[] */ (statuses).includes(document.status);
};

/** @type API.fromJs */
export const fromJs = (js, location = "#") => {
  switch (typeof js) {
    case "boolean":
      return {
        type: "json",
        jsonType: "boolean",
        value: js,
        location: location
      };

    case "number":
      return {
        type: "json",
        jsonType: "number",
        value: js,
        location: location
      };

    case "string":
      return {
        type: "json",
        jsonType: "string",
        value: js,
        location: location
      };

    case "object":
      if (js === null) {
        return {
          type: "json",
          jsonType: "null",
          value: js,
          location: location
        };
      }

      if (Array.isArray(js)) {
        return {
          type: "json",
          jsonType: "array",
          children: js.map((item, index) => fromJs(item, JsonPointer.append(`${index}`, location))),
          location: location
        };
      }

      if (Object.getPrototypeOf(js) === Object.prototype) {
        /** @type JsonPropertyNode<JsonNode>[] */
        const properties = [];
        for (const key in js) {
          properties.push({
            type: "json-property",
            children: [
              {
                type: "json-property-name",
                jsonType: "string",
                value: key
              },
              fromJs(js[key], JsonPointer.append(key, location))
            ]
          });
        }

        return {
          type: "json",
          jsonType: "object",
          children: properties,
          location: location
        };
      }

      const type = js.constructor?.name ?? "*anonymous*";
      throw TypeError(`Not a JSON compatible type: ${type}`);

    default:
      throw TypeError(`Not a JSON compatible type: ${typeof js}`);
  }
};

/** @type API.Replacer */
const defaultReplacer = (node) => node;

/** @type API.toJson */
export const toJson = (node, replacer = defaultReplacer, space = "") => {
  const replacedNode = replace(node, replacer);
  return replacedNode ? stringifyValue(replacedNode, replacer, space, 1) : "";
};

/**
 * Apply the replacer to a value. A missing value is treated like a value the
 * replacer removed. An invalid value can't be represented in JSON, so it's an
 * error.
 *
 * @type (node: JsonNode<unknown, JsonErrorNode> | JsonErrorNode, replacer: API.Replacer, key?: string) => JsonNode<unknown> | undefined
 */
const replace = (node, replacer, key) => {
  switch (node.type) {
    case "json-missing":
      return undefined;
    case "json-invalid": {
      const invalidNode = /** @type JsonInvalidNode */ (node);
      throw TypeError(`Can't convert an invalid value to JSON: '${invalidNode.raw}' at ${invalidNode.location}`);
    }
    default:
      return replacer(/** @type JsonNode<unknown> */ (node), key);
  }
};

/** @type (node: JsonNode<unknown>, replacer: API.Replacer, space: string, depth: number) => string */
const stringifyValue = (node, replacer, space, depth) => {
  switch (node.jsonType) {
    case "array":
      return stringifyArray(node, replacer, space, depth);
    case "object":
      return stringifyObject(node, replacer, space, depth);
    default:
      return JSON.stringify(node.value);
  }
};

/** @type (node: JsonArrayNode<unknown>, replacer: API.Replacer, space: string, depth: number) => string */
const stringifyArray = (node, replacer, space, depth) => {
  if (node.children.length === 0) {
    return "[]";
  }

  const padding = space ? `\n${space.repeat(depth - 1)}` : "";

  /** @type string[] */
  const items = [];
  for (let index = 0; index < node.children.length; index++) {
    const itemNode = replace(node.children[index], replacer, `${index}`);
    items.push(itemNode === undefined ? "null" : stringifyValue(itemNode, replacer, space, depth + 1));
  }
  return "[" + padding + space + items.join(`,${padding}${space}`) + padding + "]";
};

/** @type (node: JsonObjectNode<unknown>, replacer: API.Replacer, space: string, depth: number) => string */
const stringifyObject = (node, replacer, space, depth) => {
  const padding = space ? `\n${space.repeat(depth - 1)}` : "";
  const colonSpacing = space ? " " : "";

  /** @type string[] */
  const properties = [];
  for (const propertyNode of node.children) {
    const [keyNode, valueNode] = propertyNode.children;
    const replacedValueNode = replace(valueNode, replacer, keyNode.value);
    if (replacedValueNode !== undefined) {
      const stringifiedValue = stringifyValue(replacedValueNode, replacer, space, depth + 1);
      properties.push(JSON.stringify(keyNode.value) + ":" + colonSpacing + stringifiedValue);
    }
  }
  if (properties.length === 0) {
    return "{}";
  }
  return "{" + padding + space + properties.join(`,${padding}${space}`) + padding + "}";
};

// RFC 6901: array-index = %x30 / ( %x31-39 *(%x30-39) )
const arrayIndexPattern = /^(?:0|[1-9][0-9]*)$/;

/** @type API.pointerStep */
export const pointerStep = (segment, node, uri = "#") => {
  switch (node.jsonType) {
    case "object": {
      let found = false;
      let result;
      for (const [keyNode, valueNode] of propertyEntries(node.children)) {
        if (keyNode.value === segment) {
          // RFC 6901: If a referenced member name is not unique in an object,
          // the member that is referenced is undefined, and evaluation fails.
          if (found) {
            const uriMessage = uri ? ` at ${uri}` : "";
            throw new JsonPointerError(`Property '${segment}' is not unique${uriMessage}`);
          }
          found = true;
          result = valueNode;
        }
      }
      if (!found) {
        const uriMessage = uri ? ` at ${uri}` : "";
        throw new JsonPointerError(`Property '${segment}' doesn't exist${uriMessage}`);
      }
      return result;
    }
    case "array": {
      if (segment !== "-" && !arrayIndexPattern.test(segment)) {
        const uriMessage = uri ? ` at ${uri}` : "";
        throw new JsonPointerError(`'${segment}' is not a valid array index${uriMessage}`);
      }
      const index = segment === "-" ? node.children.length : parseInt(segment, 10);
      if (!node.children[index]) {
        const uriMessage = uri ? ` at ${uri}` : "";
        throw new JsonPointerError(`Index '${index}' doesn't exist${uriMessage}`);
      }
      return memberValue(node.children[index]);
    }
    default: {
      const uriMessage = uri ? ` at ${uri}` : "";
      throw new JsonPointerError(`Can't index into scalar value${uriMessage}`);
    }
  }
};

/** @type API.pointerGet */
export const pointerGet = (pointer, tree, documentUri) => {
  let currentPointer = "";
  let node = memberValue(tree);
  for (const segment of pointerSegments(pointer)) {
    const uri = `${documentUri}#${currentPointer}`;
    if (node === undefined) {
      throw new JsonPointerError(`Can't index into a missing value at ${uri}`);
    }
    if (node.type === "json-invalid") {
      throw new JsonPointerError(`Can't index into an invalid value at ${uri}`);
    }

    currentPointer += "/" + escapePointerSegment(segment);
    node = pointerStep(segment, /** @type Parameters<typeof pointerStep>[1] */ (node), `${documentUri}#${currentPointer}`);
  }

  return node;
};

/** @type (pointer: string) => Generator<string> */
const pointerSegments = function* (pointer) {
  if (pointer.length > 0 && !pointer.startsWith("/")) {
    throw Error("Invalid JSON Pointer");
  }

  let segmentStart = 1;
  let segmentEnd = 0;

  while (segmentEnd < pointer.length) {
    const position = pointer.indexOf("/", segmentStart);
    segmentEnd = position === -1 ? pointer.length : position;
    const segment = pointer.slice(segmentStart, segmentEnd);
    segmentStart = segmentEnd + 1;

    yield unescapePointerSegment(segment);
  }
};

/** @type (segment: string) => string */
const unescapePointerSegment = (segment) => segment.toString()
  .replace(/~1/g, "/")
  .replace(/~0/g, "~");

/** @type (segment: string) => string */
const escapePointerSegment = (segment) => segment.toString()
  .replace(/~/g, "~0")
  .replace(/\//g, "~1");

// eslint-disable-next-line @stylistic/no-extra-parens
export const jsonValue = /** @type API.jsonValue */ ((/** @type JsonNode<unknown, JsonErrorNode> */ node) => {
  switch (node.jsonType) {
    case "object":
    case "array":
      // TODO: Handle structured values
      throw Error("Can't get the value of a structured value.");
    default:
      return node.value;
  }
});

/** @type API.jsonObjectHas */
export const jsonObjectHas = (key, node) => {
  if (node.jsonType === "object") {
    for (const [keyNode] of propertyEntries(node.children)) {
      if (keyNode.value === key) {
        return true;
      }
    }
  }

  return false;
};

/** @type API.jsonArrayIter */
export const jsonArrayIter = function* (node) {
  if (node.jsonType === "array") {
    for (const itemNode of node.children) {
      yield memberValue(itemNode);
    }
  }
};

/** @type API.jsonObjectKeys */
export const jsonObjectKeys = function* (node) {
  if (node.jsonType === "object") {
    for (const [keyNode] of propertyEntries(node.children)) {
      yield keyNode.value;
    }
  }
};

/** @type API.jsonObjectValues */
export const jsonObjectValues = function* (node) {
  if (node.jsonType === "object") {
    for (const [, valueNode] of propertyEntries(node.children)) {
      yield valueNode;
    }
  }
};

/** @type API.jsonObjectEntries */
export const jsonObjectEntries = function* (node) {
  if (node.jsonType === "object") {
    for (const [keyNode, valueNode] of propertyEntries(node.children)) {
      yield [keyNode.value, valueNode];
    }
  }
};

/**
 * A missing value from a failed parse is presented as `undefined`.
 *
 * @type (node: any) => any
 */
const memberValue = (node) => {
  return node.type === "json-missing" ? undefined : node;
};

/** @type (propertyNodes: JsonPropertyNode<any, any>[]) => Generator<[JsonPropertyNameNode, any]> */
const propertyEntries = function* (propertyNodes) {
  for (const propertyNode of propertyNodes) {
    const [keyNode, valueNode] = propertyNode.children;
    yield [keyNode, memberValue(valueNode)];
  }
};

/** @implements API.JsonPointerError */
export class JsonPointerError extends Error {
  /**
   * @param {string} [message]
   */
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}
