import { VFileMessage } from "vfile-message";
import { jsonLexer, place } from "./json-lexer.js";

/**
 * @import { Parent, Position } from "unist"
 * @import { JsonLexer, JsonToken } from "./json-lexer.js"
 * @import {
 *   JsonArrayNode,
 *   JsonDocumentNode,
 *   JsonNode,
 *   JsonObjectNode,
 *   JsonPropertyNameNode,
 *   JsonPropertyNode
 * } from "./jsonast.d.ts"
 */


/** @type (json: string) => JsonDocumentNode */
export const fromJson = (json) => {
  const lexer = jsonLexer(json);

  /** @type JsonDocumentNode */
  const jsonDocument = {
    type: "json-document",
    children: []
  };

  const token = nextToken(lexer);
  const jsonValue = parseValue(token, lexer);
  jsonDocument.children.push(jsonValue);

  if (!lexer.next().done) {
    throw syntaxError("Additional tokens found");
  }

  return jsonDocument;
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

/** @type (token: JsonToken, lexer: JsonLexer) => JsonNode */
const parseValue = (token, lexer) => {
  switch (token.type) {
    case "null":
    case "boolean":
    case "number":
    case "string":
      return parseScalar(token);
    case "[":
      return parseArray(token, lexer);
    case "{":
      return parseObject(token, lexer);
    default:
      throw syntaxError("Expected a JSON value", token);
  }
};

/** @type (token: JsonToken<"null" | "boolean" | "number" | "string">) => JsonNode */
const parseScalar = (token) => {
  return {
    type: "json",
    jsonType: token.type,
    value: JSON.parse(token.value), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    position: tokenPosition(token)
  };
};

/** @type (token: JsonToken, lexer: JsonLexer) => JsonPropertyNode */
const parseProperty = (token, lexer) => {
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

  const valueNode = parseValue(nextToken(lexer), lexer);

  return {
    type: "json-property",
    children: [keyNode, valueNode],
    position: {
      start: /** @type Position */ (keyNode.position).start,
      end: /** @type Position */ (valueNode.position).end
    }
  };
};

/** @type <A extends Parent>(parseChild: (token: JsonToken, lexer: JsonLexer) => A["children"][number], endToken: string) => (lexer: JsonLexer, node: A) => A */
const parseCommaSeparated = (parseChild, endToken) => (lexer, node) => {
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

    const childNode = parseChild(token, lexer);
    node.children.push(childNode);
    /** @type Position */ (node.position).end = /** @type Position */ (childNode.position).end;
  }
};

/** @type (arrayToken: JsonToken<"[">, lexer: JsonLexer) => JsonArrayNode */
const parseArray = (openToken, lexer) => {
  return parseItems(lexer, {
    type: "json",
    jsonType: "array",
    children: [],
    position: tokenPosition(openToken)
  });
};

/** @type (lexer: JsonLexer, node: JsonArrayNode) => JsonArrayNode */
const parseItems = parseCommaSeparated(parseValue, "]");

/** @type (objectToken: JsonToken<"{">, lexer: JsonLexer) => JsonObjectNode */
const parseObject = (openToken, lexer) => {
  return parseProperties(lexer, {
    type: "json",
    jsonType: "object",
    children: [],
    position: tokenPosition(openToken)
  });
};

/** @type (lexer: JsonLexer, node: JsonObjectNode) => JsonObjectNode */
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

    yield unescape(segment);
  }
};

/** @type (segment: string) => string */
const unescape = (segment) => segment.toString().replace(/~1/g, "/").replace(/~0/g, "~");
