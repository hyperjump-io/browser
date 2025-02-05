import { JsonLexer } from "./json-lexer.js";

/**
 * @import { Node, Position } from "unist"
 * @import { JsonToken } from "./json-lexer.js"
 * @import {
 *   JsonArrayNode,
 *   JsonBooleanNode,
 *   JsonCompatible,
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
 * @typedef {(node: JsonCompatible<A>, key: string | undefined) => A | undefined} Reviver
 */

/** @type Reviver<any> */
const defaultReviver = (value) => value;

/** @type <A = JsonNode>(json: string, reviver?: Reviver<A>) => A | undefined */
export const fromJson = (json, reviver = defaultReviver) => {
  const lexer = new JsonLexer(json);

  const token = lexer.nextToken(lexer);
  const jsonValue = parseValue(token, lexer, undefined, reviver);

  lexer.done();

  return jsonValue;
};

/** @type <A>(token: JsonToken, lexer: JsonLexer, key: string | undefined, reviver: Reviver<A>) => A | undefined */
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

/** @type <T>(token: JsonToken, lexer: JsonLexer, key: string | undefined, reviver: Reviver<T>) => JsonPropertyNode<T> | undefined */
const parseProperty = (token, lexer, _key, reviver) => {
  if (token.type !== "string") {
    throw lexer.syntaxError("Expected a propertry", token);
  }

  /** @type JsonPropertyNameNode */
  const keyNode = {
    type: "json-property-name",
    value: JSON.parse(token.value), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    position: tokenPosition(token)
  };

  if (lexer.nextToken(lexer).type !== ":") {
    throw lexer.syntaxError("Expected :", token);
  }

  const valueNode = parseValue(lexer.nextToken(lexer), lexer, keyNode.value, reviver);
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
 * @type <A extends ParentNode<B>, B>(parseChild: <C>(token: JsonToken, lexer: JsonLexer, key: string | undefined, reviver: Reviver<C>) => B, endToken: string) => <C>(lexer: JsonLexer, node: A, reviver: Reviver<C>) => A
 */
const parseCommaSeparated = (parseChild, endToken) => (lexer, node, reviver) => {
  for (let index = 0; true; index++) {
    let token = lexer.nextToken(lexer);

    if (token.type === endToken) {
      /** @type Position */ (node.position).end = tokenPosition(token).end;
      return node;
    }

    if (index > 0) {
      if (token.type === ",") {
        token = lexer.nextToken(lexer);
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

/**
 * @template [A = JsonNode]
 * @typedef {(key: string | undefined, value: A) => JsonCompatible<A>} Replacer
 */

/** @type Replacer<any> */
const defaultReplacer = (_key, node) => node; // eslint-disable-line @typescript-eslint/no-unsafe-return

/** @type <A>(node: A, replacer?: Replacer<A>, space?: string) => string */
export const toJson = (node, replacer = defaultReplacer, space = "  ") => {
  const replacedNode = replacer.call(undefined, undefined, node);
  return stringifyValue(replacedNode, replacer, space, 1);
};

/** @type <A>(node: JsonCompatible<A>, replacer: Replacer<A>, space: string, depth: number) => string */
const stringifyValue = (node, replacer, space, depth) => {
  if (node.jsonType === "array") {
    return stringifyArray(node, replacer, space, depth);
  } else if (node.jsonType === "object") {
    return stringifyObject(node, replacer, space, depth);
  } else {
    return JSON.stringify(node.value);
  }
};

/** @type <A>(node: JsonArrayNode<A>, replacer: Replacer<A>, space: string, depth: number) => string */
const stringifyArray = (node, replacer, space, depth) => {
  if (node.children.length === 0) {
    return "[]";
  }

  const padding = space ? `\n${space.repeat(depth - 1)}` : "";

  let result = "[" + padding + space;
  for (let index = 0; index < node.children.length; index++) {
    const itemNode = replacer.call(node, `${index}`, node.children[index]);
    const stringifiedValue = stringifyValue(itemNode, replacer, space, depth + 1);
    result += stringifiedValue ?? "null";
    if (index + 1 < node.children.length) {
      result += `,${padding}${space}`;
    }
  }
  return result + padding + "]";
};

/** @type <A>(node: JsonObjectNode<A>, replacer: Replacer<A>, space: string, depth: number) => string */
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
    const replacedValueNode = replacer.call(node, keyNode.value, valueNode);
    const stringifiedValue = stringifyValue(replacedValueNode, replacer, space, depth + 1);
    if (stringifiedValue !== undefined) {
      result += JSON.stringify(keyNode.value) + ":" + colonSpacing + stringifiedValue;
      if (node.children[index + 1]) {
        result += `,${padding}${space}`;
      }
    }
  }
  return result + padding + "}";
};

/** @type (pointer: string, tree: JsonNode) => JsonNode | undefined */
export const pointerGet = (pointer, tree) => {
  let node = tree;
  segments: for (const segment of pointerSegments(pointer)) {
    switch (node.jsonType) {
      case "object":
        for (const propertyNode of node.children) {
          if (propertyNode.children[0].value === segment) {
            node = propertyNode.children[1];
            continue segments;
          }
        }
        return;
      case "array":
        const index = segment === "-" ? node.children.length : parseInt(segment);
        node = node.children[index];
        if (!node) {
          return;
        }
        break;
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
