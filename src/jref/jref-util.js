import { VFileMessage } from "vfile-message";
import { jsonLexer, place } from "../json/json-lexer.js";

/**
 * @import { Parent, Position } from "unist"
 * @import { JsonLexer, JsonToken } from "../json/json-lexer.js"
 * @import {
 *   JsonArrayNode,
 *   JsonObjectNode,
 *   JsonPropertyNameNode,
 *   JsonPropertyNode
 * } from "../json/jsonast.d.ts"
 * @import {
 *   JrefDocumentNode,
 *   JrefNode,
 *   JrefReferenceNode
 * } from "./jref-ast.d.ts"
 */


/** @type (jref: string) => JrefDocumentNode */
export const fromJref = (jref) => {
  const lexer = jsonLexer(jref);

  /** @type JrefDocumentNode */
  const jrefDocument = {
    type: "jref-document",
    children: []
  };

  const token = nextToken(lexer);
  const jrefValue = parseValue(token, lexer);
  jrefDocument.children.push(jrefValue);

  if (!lexer.next().done) {
    throw syntaxError("Additional tokens found");
  }

  return jrefDocument;
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
    source: "jref",
    ruleId: "syntax-error",
    place: place(token)
  });
};

/** @type (token: JsonToken, lexer: JsonLexer) => JrefNode */
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
      throw syntaxError("Expected a JRef value", token);
  }
};

/** @type (token: JsonToken<"null" | "boolean" | "number" | "string">) => JrefNode */
const parseScalar = (token) => {
  return {
    type: "json",
    jsonType: token.type,
    value: JSON.parse(token.value), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    position: tokenPosition(token)
  };
};

/** @type (token: JsonToken, lexer: JsonLexer) => JsonPropertyNode<JrefNode> */
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

/** @type (arrayToken: JsonToken<"[">, lexer: JsonLexer) => JsonArrayNode<JrefNode> */
const parseArray = (openToken, lexer) => {
  return parseItems(lexer, {
    type: "json",
    jsonType: "array",
    children: [],
    position: tokenPosition(openToken)
  });
};

/** @type (lexer: JsonLexer, node: JsonArrayNode<JrefNode>) => JsonArrayNode<JrefNode> */
const parseItems = parseCommaSeparated(parseValue, "]");

/** @type (objectToken: JsonToken<"{">, lexer: JsonLexer) => JsonObjectNode<JrefNode> | JrefReferenceNode */
const parseObject = (openToken, lexer) => {
  const objectNode = parseProperties(lexer, {
    type: "json",
    jsonType: "object",
    children: [],
    position: tokenPosition(openToken)
  });

  const href = isReference(objectNode);
  if (href) {
    return {
      type: "jref-reference",
      value: href,
      position: objectNode.position
    };
  } else {
    return objectNode;
  }
};

/** @type (node: JsonObjectNode<JrefNode>) => string | undefined */
const isReference = (objectNode) => {
  for (const propertyNode of objectNode.children) {
    const valueNode = propertyNode.children[1];
    if (propertyNode.children[0].value === "$ref" && valueNode.type === "json" && valueNode.jsonType === "string") {
      return valueNode.value;
    }
  }
};

/** @type (lexer: JsonLexer, node: JsonObjectNode<JrefNode>) => JsonObjectNode<JrefNode> */
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
