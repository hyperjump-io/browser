import { parseJson } from "./json-parser.js";

export { jsonSyntaxErrorMessage } from "./json-parser.js";
import { relativeFileUri } from "../hyperjump/file-uris.js";
import { appendToLocation } from "./location.js";

/**
 * @import {
 *   Json,
 *   JsonArrayNode,
 *   JsonInvalidNode,
 *   JsonNode,
 *   JsonObjectNode,
 *   JsonPropertyNameNode,
 *   JsonErrorNode,
 *   JsonPropertyNode,
 *   ReadonlyJson
 * } from "./jsonast.js"
 * @import * as API from "./jsonast-util.d.ts"
 */

/** @type typeof API.fromJson */
export const fromJson = (json, location = "", options = {}) => {
  return parseJson(json, location, options);
};

// A function's return type isn't inferred as a type predicate, so the
// function is cast to the declared type rather than annotated with it.
// eslint-disable-next-line @stylistic/no-extra-parens
export const hasStatus = /** @type typeof API.hasStatus */ ((document, ...statuses) => {
  return /** @type string[] */ (statuses).includes(document.status);
});

/** @type typeof API.fromJs */
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
          // An index never needs escaping or encoding
          children: js.map((item, index) => fromJs(item, `${location}/${index}`)),
          location: location
        };
      }

      if (Object.getPrototypeOf(js) === Object.prototype) {
        // `Array.isArray` doesn't narrow out readonly arrays
        const object = /** @type {{ readonly [property: string]: ReadonlyJson }} */ (js);
        /** @type JsonPropertyNode<JsonNode>[] */
        const properties = [];
        for (const key in object) {
          properties.push({
            type: "json-property",
            children: [
              {
                type: "json-property-name",
                jsonType: "string",
                value: key
              },
              fromJs(object[key], appendToLocation(key, location))
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

/** @type typeof API.toJson */
export const toJson = (node, options = {}) => {
  const valueNode = presentValue(node);
  return valueNode ? stringifyValue(valueNode, options.space ?? "", 1) : "";
};

// RFC 6901: array-index = %x30 / ( %x31-39 *(%x30-39) )
const arrayIndexPattern = /^(?:0|[1-9][0-9]*)$/;

/** @type typeof API.jsonStep */
export const jsonStep = (key, node) => {
  switch (node.jsonType) {
    case "object": {
      let found = false;
      let result;
      for (const [keyNode, valueNode] of propertyEntries(node.children)) {
        if (keyNode.value === key) {
          // RFC 6901: If a referenced member name is not unique in an object,
          // the member that is referenced is undefined, and evaluation fails.
          if (found) {
            throw new JsonPointerError(`Property '${key}' is not unique at ${stepLocation(key, node)}`);
          }
          found = true;
          result = valueNode;
        }
      }
      if (!found) {
        throw new JsonPointerError(`Property '${key}' doesn't exist at ${stepLocation(key, node)}`);
      }
      return result;
    }
    case "array": {
      if (key !== "-" && !arrayIndexPattern.test(key)) {
        throw new JsonPointerError(`'${key}' is not a valid array index at ${stepLocation(key, node)}`);
      }
      const index = key === "-" ? node.children.length : parseInt(key, 10);
      if (!node.children[index]) {
        throw new JsonPointerError(`Index '${index}' doesn't exist at ${stepLocation(key, node)}`);
      }
      return memberValue(node.children[index]);
    }
    default: {
      throw new JsonPointerError(`Can't index into scalar value at ${stepLocation(key, node)}`);
    }
  }
};

/** @type (segment: string, node: { location: string }) => string */
const stepLocation = (segment, node) => relativeFileUri(appendToLocation(segment, node.location));

/** @type typeof API.jsonPointerGet */
export const jsonPointerGet = (pointer, tree) => {
  let parent = tree;
  let parentSegment;
  let node = memberValue(tree);
  for (const segment of pointerSegments(pointer)) {
    if (node === undefined) {
      const location = parentSegment === undefined ? relativeFileUri(tree.location) : stepLocation(parentSegment, parent);
      throw new JsonPointerError(`Can't index into a missing value at ${location}`);
    }
    if (node.type === "json-invalid") {
      throw new JsonPointerError(`Can't index into an invalid value at ${relativeFileUri(node.location)}`);
    }

    parent = node;
    parentSegment = segment;
    node = jsonStep(segment, node);
  }

  return node;
};

// eslint-disable-next-line @stylistic/no-extra-parens
export const jsonValue = /** @type typeof API.jsonValue */ ((/** @type JsonNode<unknown, JsonErrorNode> */ node) => {
  switch (node.jsonType) {
    case "array":
      return node.children.map((itemNode) => isErrorNode(itemNode) ? null : jsonValue(itemNode));
    case "object": {
      // Entries make own properties, like JSON.parse does, so a "__proto__"
      // key is a property, not the object's prototype
      /** @type [string, Json][] */
      const entries = [];
      for (const propertyNode of node.children) {
        const [keyNode, valueNode] = propertyNode.children;
        if (!isErrorNode(valueNode)) {
          entries.push([keyNode.value, jsonValue(valueNode)]);
        }
      }
      return Object.fromEntries(entries);
    }
    default:
      return node.value;
  }
});

/** @type typeof API.jsonObjectHas */
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

/** @type typeof API.jsonArrayIter */
export const jsonArrayIter = function* (node) {
  if (node.jsonType === "array") {
    for (const itemNode of node.children) {
      yield memberValue(itemNode);
    }
  }
};

/** @type typeof API.jsonObjectKeys */
export const jsonObjectKeys = function* (node) {
  if (node.jsonType === "object") {
    for (const [keyNode] of propertyEntries(node.children)) {
      yield keyNode.value;
    }
  }
};

/** @type typeof API.jsonObjectValues */
export const jsonObjectValues = function* (node) {
  if (node.jsonType === "object") {
    for (const [, valueNode] of propertyEntries(node.children)) {
      yield valueNode;
    }
  }
};

/** @type typeof API.jsonObjectEntries */
export const jsonObjectEntries = function* (node) {
  if (node.jsonType === "object") {
    for (const [keyNode, valueNode] of propertyEntries(node.children)) {
      yield [keyNode.value, valueNode];
    }
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

/**
 * The value to write for a node, or `undefined` for a missing value, which
 * is written the way `JSON.stringify` writes `undefined`. An invalid value
 * can't be represented in JSON, so it's an error.
 *
 * @type (node: JsonNode<unknown, JsonErrorNode> | JsonErrorNode) => JsonNode<unknown> | undefined
 */
const presentValue = (node) => {
  switch (node.type) {
    case "json-missing":
      return undefined;
    case "json-invalid": {
      const invalidNode = /** @type JsonInvalidNode */ (node);
      throw TypeError(`Can't convert an invalid value to JSON: '${invalidNode.raw}' at ${relativeFileUri(invalidNode.location)}`);
    }
    default:
      return /** @type JsonNode<unknown> */ (node);
  }
};

/** @type (node: JsonNode<unknown>, space: string, depth: number) => string */
const stringifyValue = (node, space, depth) => {
  switch (node.jsonType) {
    case "array":
      return stringifyArray(node, space, depth);
    case "object":
      return stringifyObject(node, space, depth);
    default:
      return JSON.stringify(node.value);
  }
};

/** @type (node: JsonArrayNode<unknown>, space: string, depth: number) => string */
const stringifyArray = (node, space, depth) => {
  if (node.children.length === 0) {
    return "[]";
  }

  const padding = space ? `\n${space.repeat(depth - 1)}` : "";

  /** @type string[] */
  const items = [];
  for (const item of node.children) {
    const itemNode = presentValue(item);
    items.push(itemNode === undefined ? "null" : stringifyValue(itemNode, space, depth + 1));
  }
  return "[" + padding + space + items.join(`,${padding}${space}`) + padding + "]";
};

/** @type (node: JsonObjectNode<unknown>, space: string, depth: number) => string */
const stringifyObject = (node, space, depth) => {
  const padding = space ? `\n${space.repeat(depth - 1)}` : "";
  const colonSpacing = space ? " " : "";

  /** @type string[] */
  const properties = [];
  for (const propertyNode of node.children) {
    const [keyNode, valueNode] = propertyNode.children;
    const presentValueNode = presentValue(valueNode);
    if (presentValueNode !== undefined) {
      const stringifiedValue = stringifyValue(presentValueNode, space, depth + 1);
      properties.push(JSON.stringify(keyNode.value) + ":" + colonSpacing + stringifiedValue);
    }
  }
  if (properties.length === 0) {
    return "{}";
  }
  return "{" + padding + space + properties.join(`,${padding}${space}`) + padding + "}";
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

/**
 * @param {JsonNode<unknown, JsonErrorNode> | JsonErrorNode} node
 * @returns {node is JsonErrorNode}
 */
const isErrorNode = (node) => node.type === "json-missing" || node.type === "json-invalid";

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
