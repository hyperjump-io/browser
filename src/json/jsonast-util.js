import { JsonLexer } from "./json-lexer.js";

/**
 * @import { Node, Position } from "unist"
 * @import { JsonToken } from "./json-lexer.js"
 * @import {
 *   JsonArrayNode,
 *   JsonBooleanNode,
 *   JsonJsonNode,
 *   JsonNode,
 *   JsonNullNode,
 *   JsonNumberNode,
 *   JsonObjectNode,
 *   JsonPropertyNameNode,
 *   JsonPropertyNode,
 *   JsonStringNode
 * } from "./jsonast.js"
 * @import * as API from "./jsonast-util.d.ts"
 */


/** @type API.Reviver */
const defaultReviver = (value) => value;

/**
 * @overload
 * @param {string} json
 * @returns {JsonJsonNode}
 *
 * @overload
 * @param {string} json
 * @param {API.Reviver} reviver
 * @returns {JsonNode<any> | undefined}
 *
 * @param {string} json
 * @param {API.Reviver} [reviver]
 * @returns {JsonJsonNode | JsonNode<any> | undefined}
 *
 * @type API.fromJson
 */
export const fromJson = (json, reviver = defaultReviver) => {
  const lexer = new JsonLexer(json);

  const token = lexer.nextToken();
  const jsonValue = parseValue(token, lexer, undefined, reviver);

  lexer.done();

  return jsonValue;
};

/** @type (token: JsonToken, lexer: JsonLexer, key: string | undefined, reviver: API.Reviver) => JsonNode<any> | undefined */
const parseValue = (token, lexer, key, reviver) => {
  let node;

  switch (token.type) {
    case "null":
    case "boolean":
    case "number":
    case "string":
      node = parseScalar(token);
      break;
    case "[":
      node = parseArray(token, lexer, reviver);
      break;
    case "{":
      node = parseObject(token, lexer, reviver);
      break;
    default:
      throw lexer.syntaxError("Expected a JSON value", token);
  }

  return reviver(node, key);
};

/** @type (token: JsonToken<"null" | "boolean" | "number" | "string">) => JsonNullNode | JsonBooleanNode | JsonNumberNode | JsonStringNode */
const parseScalar = (token) => {
  return {
    type: "json",
    jsonType: token.type,
    value: JSON.parse(token.value), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    position: tokenPosition(token)
  };
};

/** @type (token: JsonToken, lexer: JsonLexer, key: string | undefined, reviver: API.Reviver) => JsonPropertyNode<JsonNode<any>> | undefined */
const parseProperty = (token, lexer, _key, reviver) => {
  if (token.type !== "string") {
    throw lexer.syntaxError("Expected a propertry", token);
  }

  /** @type JsonPropertyNameNode */
  const keyNode = {
    type: "json-property-name",
    jsonType: "string",
    value: JSON.parse(token.value), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    position: tokenPosition(token)
  };

  if (lexer.nextToken().type !== ":") {
    throw lexer.syntaxError("Expected :", token);
  }

  const valueNode = parseValue(lexer.nextToken(), lexer, keyNode.value, reviver);
  if (!valueNode) {
    return;
  }

  return {
    type: "json-property",
    children: [keyNode, valueNode]
  };
};

/**
 * @template A
 * @typedef {Node & { children: A[] }} ParentNode
 */

/**
 * @type <A extends ParentNode<B>, B>(
 *   parseChild: (
 *     token: JsonToken,
 *     lexer: JsonLexer,
 *     key: string | undefined,
 *     reviver: API.Reviver
 *   ) => B | undefined,
 *   endToken: string
 * ) => (
 *   lexer: JsonLexer,
 *   node: A,
 *   reviver: API.Reviver
 * ) => A
 */
const parseCommaSeparated = (parseChild, endToken) => (lexer, node, reviver) => {
  for (let index = 0; true; index++) {
    let token = lexer.nextToken();

    if (token.type === endToken) {
      /** @type Position */ (node.position).end = tokenPosition(token).end;
      return node;
    }

    if (index > 0) {
      if (token.type === ",") {
        token = lexer.nextToken();
      } else {
        throw lexer.syntaxError(`Expected , or ${endToken}`, token);
      }
    }

    const childNode = parseChild(token, lexer, `${index}`, reviver);
    if (childNode) {
      node.children.push(childNode);
    }
  }
};

/** @type (openToken: JsonToken, lexer: JsonLexer, reviver: API.Reviver) => JsonArrayNode<any> */
const parseArray = (openToken, lexer, reviver) => {
  return parseItems(lexer, {
    type: "json",
    jsonType: "array",
    children: [],
    position: tokenPosition(openToken)
  }, reviver);
};

/** @type (lexer: JsonLexer, node: JsonArrayNode<any>, reviver: API.Reviver) => JsonArrayNode<any> */
const parseItems = parseCommaSeparated(parseValue, "]");

/** @type (openToken: JsonToken, lexer: JsonLexer, reviver: API.Reviver) => JsonObjectNode<any> */
const parseObject = (openToken, lexer, reviver) => {
  return parseProperties(lexer, {
    type: "json",
    jsonType: "object",
    children: [],
    position: tokenPosition(openToken)
  }, reviver);
};

/** @type (lexer: JsonLexer, node: JsonObjectNode<any>, reviver: API.Reviver) => JsonObjectNode<any> */
const parseProperties = parseCommaSeparated(parseProperty, "}");

/** @type (startToken: JsonToken, endToken?: JsonToken) => Position */
const tokenPosition = (startToken, endToken) => {
  endToken ??= startToken;

  return {
    start: {
      line: startToken.line,
      column: startToken.col,
      offset: startToken.offset
    },
    end: {
      line: endToken.line,
      column: endToken.col + endToken.text.length,
      offset: endToken.offset + endToken.text.length
    }
  };
};

/** @type API.fromJs */
export const fromJs = (js) => {
  switch (typeof js) {
    case "boolean":
      return {
        type: "json",
        jsonType: "boolean",
        value: js
      };

    case "number":
      return {
        type: "json",
        jsonType: "number",
        value: js
      };

    case "string":
      return {
        type: "json",
        jsonType: "string",
        value: js
      };

    case "object":
      if (js === null) {
        return {
          type: "json",
          jsonType: "null",
          value: js
        };
      }

      if (Array.isArray(js)) {
        return {
          type: "json",
          jsonType: "array",
          children: js.map(fromJs)
        };
      }

      if (Object.getPrototypeOf(js) === Object.prototype) {
        /** @type JsonPropertyNode<JsonJsonNode>[] */
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
              fromJs(js[key])
            ]
          });
        }

        return {
          type: "json",
          jsonType: "object",
          children: properties
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
  const replacedNode = replacer(node);
  return replacedNode ? stringifyValue(replacedNode, replacer, space, 1) : "";
};

/** @type (node: JsonNode<JsonNode<any>>, replacer: API.Replacer, space: string, depth: number) => string */
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

/** @type (node: JsonArrayNode<JsonNode<any>>, replacer: API.Replacer, space: string, depth: number) => string */
const stringifyArray = (node, replacer, space, depth) => {
  if (node.children.length === 0) {
    return "[]";
  }

  const padding = space ? `\n${space.repeat(depth - 1)}` : "";

  let result = "[" + padding + space;
  for (let index = 0; index < node.children.length; index++) {
    const itemNode = replacer(node.children[index], `${index}`);
    if (itemNode !== undefined) {
      const stringifiedValue = stringifyValue(itemNode, replacer, space, depth + 1);
      result += stringifiedValue ?? "null";
      if (index + 1 < node.children.length) {
        result += `,${padding}${space}`;
      }
    }
  }
  return result + padding + "]";
};

/** @type (node: JsonObjectNode<JsonNode<any>>, replacer: API.Replacer, space: string, depth: number) => string */
const stringifyObject = (node, replacer, space, depth) => {
  if (node.children.length === 0) {
    return "{}";
  }

  const padding = space ? `\n${space.repeat(depth - 1)}` : "";
  const colonSpacing = space ? " " : "";

  let result = "{" + padding + space;
  for (let index = 0; index < node.children.length; index++) {
    const propertyNode = node.children[index];
    const [keyNode, valueNode] = propertyNode.children;
    const replacedValueNode = replacer(valueNode, keyNode.value);
    if (replacedValueNode !== undefined) {
      const stringifiedValue = stringifyValue(replacedValueNode, replacer, space, depth + 1);
      result += JSON.stringify(keyNode.value) + ":" + colonSpacing + stringifiedValue;
      if (node.children[index + 1]) {
        result += `,${padding}${space}`;
      }
    }
  }
  return result + padding + "}";
};

/** @type API.pointerStep */
export const pointerStep = (segment, node, uri = "#") => {
  switch (node.jsonType) {
    case "object": {
      for (const propertyNode of node.children) {
        if (propertyNode.children[0].value === segment) {
          return propertyNode.children[1];
        }
      }
      const uriMessage = uri ? ` at ${uri}` : "";
      throw new JsonPointerError(`Property '${segment}' doesn't exist${uriMessage}`);
    }
    case "array": {
      const index = segment === "-" ? node.children.length : parseInt(segment);
      if (!node.children[index]) {
        const uriMessage = uri ? ` at ${uri}` : "";
        throw new JsonPointerError(`Index '${index}' doesn't exist${uriMessage}`);
      }
      return node.children[index];
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
  let node = tree;
  for (const segment of pointerSegments(pointer)) {
    currentPointer += "/" + escapePointerSegment(segment);
    node = pointerStep(segment, node, `${documentUri}#${currentPointer}`);
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
const unescapePointerSegment = (segment) => segment.toString().replace(/~1/g, "/").replace(/~0/g, "~");

/** @type (segment: string) => string */
const escapePointerSegment = (segment) => segment.toString().replace(/~/g, "~0").replace(/\//g, "~1");

// eslint-disable-next-line @stylistic/no-extra-parens
export const jsonValue = /** @type API.jsonValue */ ((node) => {
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
    for (const property of node.children) {
      if (property.children[0].value === key) {
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
      yield itemNode;
    }
  }
};

/** @type API.jsonObjectKeys */
export const jsonObjectKeys = function* (node) {
  if (node.jsonType === "object") {
    for (const propertyNode of node.children) {
      yield propertyNode.children[0].value;
    }
  }
};

/** @type API.jsonObjectValues */
export const jsonObjectValues = function* (node) {
  if (node.jsonType === "object") {
    for (const propertyNode of node.children) {
      yield propertyNode.children[1];
    }
  }
};

/** @type API.jsonObjectEntries */
export const jsonObjectEntries = function* (node) {
  if (node.jsonType === "object") {
    for (const propertyNode of node.children) {
      yield [propertyNode.children[0].value, propertyNode.children[1]];
    }
  }
};

/** @implements API.JsonPointerError */
export class JsonPointerError extends Error {
  /**
   * @param {string} [message]
   */
  constructor(message = undefined) {
    super(message);
    this.name = this.constructor.name;
  }
}
