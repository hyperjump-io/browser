import { VFileMessage } from "vfile-message";
import { jsonLexer, place } from "./json-lexer.js";

/**
 * @import { Node, Position } from "unist"
 * @import { JsonLexer, JsonToken } from "./json-lexer.js"
 * @import {
 *   JsonArrayNode,
 *   JsonBooleanNode,
 *   JsonDocumentNode,
 *   JsonNode,
 *   JsonNullNode,
 *   JsonNumberNode,
 *   JsonObjectNode,
 *   JsonPropertyNameNode,
 *   JsonPropertyNode,
 *   JsonStringNode
 * } from "./jsonast.d.ts"
 */


/**
 * @template [A = JsonNode]
 * @typedef {(node: JsonNullNode | JsonBooleanNode | JsonNumberNode | JsonStringNode | JsonArrayNode<A> | JsonObjectNode<A>) => A} Reviver
 */

/** @type Reviver<any> */
const defaultReviver = (value) => value;

/** @type <A = JsonNode>(json: string, reviver?: Reviver<A>) => A */
export const fromJson = (json, reviver = defaultReviver) => {
  const lexer = jsonLexer(json);

  const token = nextToken(lexer);
  const jsonValue = parseValue(token, lexer, reviver);

  if (!lexer.next().done) {
    throw syntaxError("Additional tokens found");
  }

  return jsonValue;
};

/** @type (lexer: JsonLexer) => JsonToken */
const nextToken = (lexer) => {
  const result = lexer.next();
  if (result.done) {
    throw syntaxError("No more tokens");
  }

  return result.value;
};

/** @type (message: string, token?: JsonToken) => VFileMessage */
const syntaxError = (message, token) => {
  throw new VFileMessage(message, {
    source: "json",
    ruleId: "syntax-error",
    place: place(token)
  });
};

/** @type <A>(token: JsonToken, lexer: JsonLexer, reviver: Reviver<A>) => A */
const parseValue = (token, lexer, reviver) => {
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
      throw syntaxError("Expected a JSON value", token);
  }

  return reviver(node);
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

/** @type <T>(token: JsonToken, lexer: JsonLexer, reviver: Reviver<T>) => JsonPropertyNode<T> */
const parseProperty = (token, lexer, reviver) => {
  if (token.type !== "string") {
    throw syntaxError("Expected a propertry", token);
  }

  /** @type JsonPropertyNameNode */
  const keyNode = {
    type: "json-property-name",
    value: JSON.parse(token.value), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    position: tokenPosition(token)
  };

  if (nextToken(lexer).type !== ":") {
    throw syntaxError("Expected :", token);
  }

  const valueNode = parseValue(nextToken(lexer), lexer, reviver);

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
 * @type <A extends ParentNode<B>, B>(parseChild: <C>(token: JsonToken, lexer: JsonLexer, reviver: Reviver<C>) => B, endToken: string) => <C>(lexer: JsonLexer, node: A, reviver: Reviver<C>) => A
 */
const parseCommaSeparated = (parseChild, endToken) => (lexer, node, reviver) => {
  while (true) {
    let token = nextToken(lexer);

    if (token.type === endToken) {
      /** @type Position */ (node.position).end = tokenPosition(token).end;
      return node;
    }

    if (node.children.length > 0) {
      if (token.type === ",") {
        token = nextToken(lexer);
      } else {
        throw syntaxError(`Expected , or ${endToken}`, token);
      }
    }

    const childNode = parseChild(token, lexer, reviver);
    node.children.push(childNode);
  }
};

/** @type <A>(openToken: JsonToken, lexer: JsonLexer, reviver: Reviver<A>) => JsonArrayNode<A> */
const parseArray = (openToken, lexer, reviver) => {
  return parseItems(lexer, {
    type: "json",
    jsonType: "array",
    children: [],
    position: tokenPosition(openToken)
  }, reviver);
};

/** @type <A>(lexer: JsonLexer, node: JsonArrayNode<A>, reviver: Reviver<A>) => JsonArrayNode<A> */
const parseItems = parseCommaSeparated(parseValue, "]");

/** @type <A>(openToken: JsonToken, lexer: JsonLexer, reviver: Reviver<A>) => JsonObjectNode<A> */
const parseObject = (openToken, lexer, reviver) => {
  return parseProperties(lexer, {
    type: "json",
    jsonType: "object",
    children: [],
    position: tokenPosition(openToken)
  }, reviver);
};

/** @type <U>(lexer: JsonLexer, node: JsonObjectNode<U>, reviver: Reviver<U>) => JsonObjectNode<U> */
const parseProperties = parseCommaSeparated(parseProperty, "}");

/** @type (startToken: JsonToken, endToken?: JsonToken) => Position */
const tokenPosition = (startToken, endToken) => {
  if (!endToken) {
    endToken = startToken;
  }

  return {
    start: {
      line: startToken.line,
      column: startToken.col,
      offset: startToken.offset
    },
    end: {
      line: endToken.line,
      column: endToken.col,
      offset: endToken.offset
    }
  };
};

/** @type (tree: JsonDocumentNode, space?: string) => string */
export const toJson = (tree, space = "  ") => {
  return stringifyValue(tree.children[0], space, 1) + "\n";
};

/** @type (node: JsonNode, space: string, depth: number) => string */
const stringifyValue = (node, space, depth) => {
  if (node.jsonType === "array") {
    return stringifyArray(node, space, depth);
  } else if (node.jsonType === "object") {
    return stringifyObject(node, space, depth);
  } else {
    return JSON.stringify(node.value);
  }
};

/** @type (node: JsonArrayNode, space: string, depth: number) => string */
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

/** @type (node: JsonObjectNode, space: string, depth: number) => string */
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

/** @type (pointer: string, tree: JsonNode) => JsonNode */
export const pointerGet = (pointer, tree) => {
  let node = tree;
  for (const segment of pointerSegments(pointer)) {
    switch (node.jsonType) {
      case "object":
        for (const propertyNode of node.children) {
          if (propertyNode.children[0].value === segment) {
            node = propertyNode.children[1];
          }
        }
        break;
      case "array":
        const index = segment === "-" ? node.children.length : parseInt(segment);
        node = node.children[index];
      default:
        throw Error("Can't index into scalar value");
    }
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
