import * as JsonPointer from "@hyperjump/json-pointer";
import { VFileMessage } from "vfile-message";
import { scanToken } from "./json-scanner.js";
import { withoutStackTraces } from "./without-stack-traces.js";

/**
 * @import { Point, Position } from "unist"
 * @import { JsonToken, JsonTokenKind } from "./json-scanner.js"
 * @import {
 *   JsonCommentNode,
 *   JsonErrorNode,
 *   JsonInvalidNode,
 *   JsonMissingNode,
 *   JsonParseStatus,
 *   JsonNode,
 *   JsonPropertyNameNode,
 *   JsonPropertyNode
 * } from "./jsonast.d.ts"
 * @import { JsonOptions, JsonParseResult, JsonSyntaxErrorCode, Reviver } from "./jsonast-util.d.ts"
 */

/**
 * @typedef {JsonNode<object, JsonErrorNode> | JsonErrorNode} JsonValueNode
 */

/**
 * @typedef {{
 *   code: JsonSyntaxErrorCode;
 *   offset: number;
 *   length: number;
 *   found?: string;
 * }} SyntaxError
 */

/**
 * @typedef {{
 *   after: { position?: Position } | undefined;
 *   offset: number;
 *   length: number;
 * }} Separator
 */

/** @type Record<JsonSyntaxErrorCode, (found?: string) => string> */
const MESSAGES = {
  "trailing-comma": () => "Trailing commas are not allowed",
  "comma-expected": () => "Expected a comma",
  "colon-expected": () => "Expected a colon",
  "value-expected": () => "Expected a value",
  "brace-not-closed": () => "Object is missing its closing brace",
  "bracket-not-closed": () => "Array is missing its closing bracket",
  "unexpected-token": (found) => `Unexpected '${found}'`,
  "end-of-file-expected": () => "Expected the end of the file",
  "property-key-expected": () => "Expected a property name",
  "property-key-not-quoted": () => "Property names must be in double quotes",
  "property-key-single-quoted": () => "Property names must use double quotes instead of single quotes",
  "string-single-quoted": () => "Strings must use double quotes instead of single quotes",
  "string-not-closed": () => "String is missing its closing quote",
  "invalid-escape": () => "Invalid escape sequence",
  "invalid-character": () => "Control characters are not allowed in strings",
  "number-invalid": (found) => `'${found}' is not a valid number`,
  "invalid-literal": (found) => `'${found}' is not a valid value`,
  "comment-not-allowed": () => "Comments are not allowed in JSON",
  "comment-not-closed": () => "Comment is missing its closing '*/'",
  "max-depth-exceeded": () => `Objects and arrays can't be nested more than ${MAX_DEPTH} levels deep`
};

// RFC 8259 allows a limit on nesting depth. Without one, deeply nested input
// would overflow the call stack.
const MAX_DEPTH = 1000;

const NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?$/;

/** @type Set<JsonTokenKind> */
const KEY_STARTS = new Set(["string", "number", "true", "false", "null", "unknown"]);

/**
 * Parse JSON text into a JSON AST, recovering from syntax errors wherever
 * possible. Every error found is returned as a VFileMessage along with the
 * best-effort AST.
 *
 * @type (text: string, location: string, reviver: Reviver<any, any>, options?: JsonOptions) => JsonParseResult<any, any>
 */
export const parseJson = (text, location, reviver, options = {}) => {
  const lineStarts = findLineStarts(text);

  /** @type SyntaxError[] */
  const errors = [];

  /** @type JsonCommentNode[] */
  const comments = [];

  // Set when the AST can't fully represent the input: a value is invalid or
  // missing, a property name is missing, or input had to be discarded
  let failed = false;
  let ranToEndOfFile = false;

  /** @type WeakSet<object> */
  const unclosed = new WeakSet();

  /** @type JsonToken */
  let token = scanToken("", 0);
  let previousOffset = 0;
  let previousLength = 0;

  /** @type (code: JsonSyntaxErrorCode, offset: number, length: number, found?: string) => void */
  const report = (code, offset, length, found) => {
    errors.push({ code, offset, length, found });
  };

  /** @type (code: JsonSyntaxErrorCode) => void */
  const reportAtPrevious = (code) => {
    report(code, previousOffset, Math.max(previousLength, 1));
  };

  // A function so type narrowing doesn't assume the token can't change
  const kind = () => token.kind;

  const raw = () => {
    return text.slice(token.offset, token.offset + token.length);
  };

  // Points are mostly requested in document order, so the line of the last
  // point is checked before searching
  let lastLine = 0;

  /** @type (line: number, offset: number) => boolean */
  const isOnLine = (line, offset) => {
    return lineStarts[line] <= offset && (line + 1 === lineStarts.length || offset < lineStarts[line + 1]);
  };

  /** @type (offset: number) => Point */
  const point = (offset) => {
    let line = lastLine;
    if (!isOnLine(line, offset)) {
      if (line + 1 < lineStarts.length && isOnLine(line + 1, offset)) {
        line++;
      } else {
        let low = 0;
        let high = lineStarts.length - 1;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (lineStarts[middle] <= offset) {
            low = middle;
          } else {
            high = middle - 1;
          }
        }
        line = low;
      }
      lastLine = line;
    }

    return { line: line + 1, column: offset - lineStarts[line] + 1, offset: offset };
  };

  /** @type (start: number, end: number) => Position */
  const position = (start, end) => {
    return { start: point(start), end: point(end) };
  };

  /** @type (comment: JsonToken) => JsonCommentNode */
  const commentNode = (comment) => {
    const isBlock = text.startsWith("/*", comment.offset);
    const end = comment.offset + comment.length;
    const valueEnd = isBlock && !comment.reachedEndOfFile ? end - 2 : end;

    return {
      type: "json-comment",
      kind: isBlock ? "block" : "line",
      value: text.slice(comment.offset + 2, valueEnd),
      position: position(comment.offset, end)
    };
  };

  /** @type (node: { position?: Position }) => number */
  const startOf = (node) => /** @type Position */ (node.position).start.offset ?? 0;

  /** @type (node: { position?: Position }) => number */
  const endOf = (node) => /** @type Position */ (node.position).end.offset ?? 0;

  /** @type (node: { position?: Position }, end: number) => void */
  const finish = (node, end) => {
    /** @type Position */ (node.position).end = point(end);
  };

  // Looking ahead scans the token that's usually consumed next, so the first
  // token scanned is kept to save scanning it again
  let peekedFrom = -1;

  /** @type JsonToken */
  let peeked = token;

  /** @type (offset: number) => JsonToken */
  const scanAt = (offset) => {
    return offset === peekedFrom ? peeked : scanToken(text, offset);
  };

  /** @type (offset: number) => JsonToken */
  const scanSignificant = (offset) => {
    let result = scanAt(offset);
    peekedFrom = offset;
    peeked = result;
    while (result.kind === "comment") {
      result = scanToken(text, result.offset + result.length);
    }
    return result;
  };

  const next = () => {
    previousOffset = token.offset;
    previousLength = token.length;

    for (;;) {
      token = scanAt(token.offset + token.length);

      for (const error of token.errors) {
        report(error.code, error.offset, error.length);
      }

      if (token.reachedEndOfFile) {
        ranToEndOfFile = true;
      }

      if (token.kind === "comment") {
        if (!options.allowComments) {
          report("comment-not-allowed", token.offset, token.length);
        } else {
          if (token.reachedEndOfFile) {
            report("comment-not-closed", token.offset, token.length);
          }
          comments.push(commentNode(token));
        }
        continue;
      }

      return;
    }
  };

  /** @type (code: JsonSyntaxErrorCode, container: JsonNode<object>, lastItem: { position?: Position } | undefined) => void */
  const reportNotClosed = (code, container, lastItem) => {
    unclosed.add(container);
    if (ranToEndOfFile) {
      return;
    }

    if (lastItem) {
      report(code, startOf(lastItem), endOf(lastItem) - startOf(lastItem));
    } else {
      report(code, startOf(container), 1);
    }
  };

  /** @type (separator: Separator) => void */
  const reportCommaExpected = (separator) => {
    if (separator.after && !unclosed.has(separator.after)) {
      report("comma-expected", separator.offset, Math.max(separator.length, 1));
    }
  };

  /** @type (after: { position?: Position } | undefined) => Separator */
  const separatorAfter = (after) => {
    return { after, offset: previousOffset, length: previousLength };
  };

  const skipStrayColons = () => {
    const start = token.offset;
    while (token.kind === ":") {
      next();
    }

    const end = previousOffset + previousLength;
    report("unexpected-token", start, end - start, text.slice(start, end));
  };

  const looksLikeProperty = () => {
    return token.kind === "string" && scanSignificant(token.offset + token.length).kind === ":";
  };

  const isEndOfContainer = () => {
    return token.kind === "}" || token.kind === "]" || token.kind === "eof";
  };

  /**
   * Parse a comma. If there's a gap where a value should be, the offset where
   * the gap starts is returned.
   *
   * @type (closer: JsonTokenKind, isExtra: boolean, isFirst: boolean) => number | undefined
   */
  const parseComma = (closer, isExtra, isFirst) => {
    const commaOffset = token.offset;
    const beforeOffset = previousOffset;
    const beforeLength = previousLength;
    next();

    const isTrailing = token.kind === closer;
    if (isTrailing) {
      report("trailing-comma", commaOffset, 1);
    }

    // A lone comma in an otherwise empty container is only a trailing comma
    if (isExtra && !(isTrailing && isFirst)) {
      report("value-expected", beforeOffset, Math.max(beforeLength, 1));
      return beforeOffset + beforeLength;
    }
  };

  /** @type (node: JsonValueNode, key: string | undefined) => JsonValueNode | undefined */
  const revive = (node, key) => {
    return node.type === "json-invalid" || node.type === "json-missing" ? node : reviver(node, key);
  };

  /** @type (nodeLocation: string, offset: number) => JsonMissingNode */
  const missing = (nodeLocation, offset) => {
    failed = true;
    return {
      type: "json-missing",
      location: nodeLocation,
      position: position(offset, offset)
    };
  };

  /** @type (nodeLocation: string) => JsonInvalidNode */
  const parseInvalid = (nodeLocation) => {
    failed = true;

    /** @type JsonInvalidNode */
    const node = {
      type: "json-invalid",
      raw: raw(),
      location: nodeLocation,
      position: position(token.offset, token.offset + token.length)
    };
    next();
    return node;
  };

  /** @type (jsonType: "null" | "boolean" | "number" | "string", value: unknown, nodeLocation: string) => JsonNode<object> */
  const parseScalar = (jsonType, value, nodeLocation) => {
    const node = /** @type JsonNode<object> */ ({
      type: "json",
      jsonType: jsonType,
      value: value,
      location: nodeLocation,
      position: position(token.offset, token.offset + token.length)
    });
    next();
    return node;
  };

  /**
   * Parse a property. The value is returned separately in its unrevived form
   * so the caller can tell whether it was left unclosed.
   *
   * @type (objectLocation: string) => { property: JsonPropertyNode<object, JsonErrorNode> | undefined, value: JsonValueNode | undefined }
   */
  const parseProperty = (objectLocation) => {
    const start = token.offset;

    /** @type JsonPropertyNameNode */
    let keyNode;
    const keyMissing = !KEY_STARTS.has(token.kind);
    if (keyMissing) {
      report("property-key-expected", token.offset, 1);
      failed = true;
      keyNode = {
        type: "json-property-name",
        jsonType: "string",
        value: "",
        position: position(token.offset, token.offset)
      };
    } else {
      if (token.kind !== "string") {
        report("property-key-not-quoted", token.offset, token.length);
      } else if (token.quote === "'") {
        report("property-key-single-quoted", token.offset, token.length);
      }

      keyNode = {
        type: "json-property-name",
        jsonType: "string",
        // For anything other than a string, the value is the text as written
        value: token.value,
        position: position(token.offset, token.offset + token.length)
      };
      next();
    }

    /** @type number | undefined */
    let colonOffset;
    if (token.kind === ":") {
      colonOffset = token.offset;
      next();
      if (token.kind === ":") {
        skipStrayColons();
      }
    } else if (!keyMissing) {
      reportAtPrevious("colon-expected");
    }

    const valueLocation = JsonPointer.append(keyNode.value, objectLocation);
    const value = looksLikeProperty() ? undefined : parseValue(valueLocation);
    if (!value) {
      if (colonOffset === undefined) {
        reportAtPrevious("value-expected");
      } else {
        report("value-expected", colonOffset, 1);
      }

      const missingNode = missing(valueLocation, previousOffset + previousLength);
      /** @type JsonPropertyNode<object, JsonErrorNode> */
      const property = {
        type: "json-property",
        children: [keyNode, missingNode],
        position: position(start, endOf(missingNode))
      };
      return { property, value };
    }

    const revivedValue = revive(value, keyNode.value);
    if (revivedValue === undefined) {
      return { property: undefined, value };
    }

    /** @type JsonPropertyNode<object, JsonErrorNode> */
    const property = {
      type: "json-property",
      children: [keyNode, revivedValue],
      position: position(start, endOf(value))
    };
    return { property, value };
  };

  /**
   * For each opening bracket, the offset where scanning resumes after its
   * container. Brackets are paired the same way the parser pairs them: a
   * closer ends any unclosed containers of the other kind before it. It's
   * computed in one pass the first time it's needed so lookahead never costs
   * more than a few tokens, no matter how the input is constructed.
   *
   * @type Map<number, number> | undefined
   */
  let containerEnds;

  /** @type (openOffset: number) => number */
  const containerEnd = (openOffset) => {
    if (!containerEnds) {
      containerEnds = new Map();

      /** @type JsonToken[] */
      const openers = [];
      let scanned = scanSignificant(0);
      while (scanned.kind !== "eof") {
        if (scanned.kind === "{" || scanned.kind === "[") {
          openers.push(scanned);
        } else if (scanned.kind === "}" || scanned.kind === "]") {
          const match = scanned.kind === "}" ? "{" : "[";
          while (openers.length > 0 && openers[openers.length - 1].kind !== match) {
            containerEnds.set(/** @type JsonToken */ (openers.pop()).offset, scanned.offset);
          }
          const opener = openers.pop();
          if (opener) {
            containerEnds.set(opener.offset, scanned.offset + scanned.length);
          }
        }
        scanned = scanSignificant(scanned.offset + scanned.length);
      }

      for (const opener of openers) {
        containerEnds.set(opener.offset, text.length);
      }
    }

    return /** @type number */ (containerEnds.get(openOffset));
  };

  /**
   * A container where an object expects a property name is either the value of
   * a property whose name is missing or the start of the next item in the
   * array this object is in, meaning this object is missing its closing brace.
   * What comes after the container decides. Anything that can only continue an
   * object means the name is missing. Anything else means the container is the
   * array's next item.
   */
  const startsNextArrayItem = () => {
    if (token.kind !== "{" && token.kind !== "[") {
      return false;
    }

    const after = scanSignificant(containerEnd(token.offset));
    if (after.kind === "]" || after.kind === "eof") {
      return true;
    }

    if (after.kind === ",") {
      const following = scanSignificant(after.offset + after.length);
      return following.kind !== "string" || scanSignificant(following.offset + following.length).kind !== ":";
    }

    return false;
  };

  let depth = 0;

  /**
   * A container nested too deeply is reported once and kept as a single
   * invalid node so the rest of the document can still be parsed.
   *
   * @type (nodeLocation: string) => JsonInvalidNode
   */
  const parseTooDeep = (nodeLocation) => {
    report("max-depth-exceeded", token.offset, 1);
    const end = containerEnd(token.offset);
    token = { ...token, kind: "unknown", length: end - token.offset, errors: [] };
    return parseInvalid(nodeLocation);
  };

  /** @type (jsonType: "object" | "array", containerLocation: string, isArrayItem: boolean) => JsonNode<object> */
  const parseContainer = (jsonType, containerLocation, isArrayItem) => {
    depth++;
    const container = /** @type JsonNode<object> & { children: unknown[] } */ ({
      type: "json",
      jsonType: jsonType,
      children: [],
      location: containerLocation,
      position: position(token.offset, token.offset + token.length)
    });
    const closer = jsonType === "object" ? "}" : "]";
    next();

    /** @type {{ position?: Position } | undefined} */
    let lastItem;
    let index = 0;

    /** @type Separator | undefined */
    let separator;
    while (!isEndOfContainer()) {
      if (token.kind === ",") {
        const gapOffset = parseComma(closer, !separator, index === 0);
        if (gapOffset !== undefined && jsonType === "array") {
          container.children.push(missing(JsonPointer.append(`${index}`, containerLocation), gapOffset));
        }
        if (gapOffset !== undefined) {
          index++;
        }
        separator = undefined;
        continue;
      }

      if (jsonType === "array" && token.kind === ":") {
        skipStrayColons();
        separator ??= separatorAfter(undefined);
        continue;
      }

      if (separator) {
        reportCommaExpected(separator);
      }

      if (jsonType === "array" && looksLikeProperty()) {
        break;
      }

      if (jsonType === "object" && isArrayItem && startsNextArrayItem()) {
        break;
      }

      if (jsonType === "object") {
        index++;
        const { property, value } = parseProperty(containerLocation);
        if (property) {
          container.children.push(property);
        }
        lastItem = property ?? value;
        separator = separatorAfter(value);
      } else {
        const key = `${index++}`;
        const item = /** @type JsonValueNode */ (parseValue(JsonPointer.append(key, containerLocation), true));
        const revivedItem = revive(item, key);
        if (revivedItem !== undefined) {
          container.children.push(revivedItem);
        }
        lastItem = item;
        separator = separatorAfter(item);
      }
    }

    if (token.kind !== closer) {
      // An unclosed container ends at its last token, not at whatever comes
      // after it
      finish(container, previousOffset + previousLength);
      reportNotClosed(jsonType === "object" ? "brace-not-closed" : "bracket-not-closed", container, lastItem);
      depth--;
      return container;
    }

    finish(container, token.offset + token.length);
    next();
    depth--;
    return container;
  };

  /** @type (valueLocation: string, isArrayItem?: boolean) => JsonNode<object> | JsonInvalidNode | undefined */
  const parseValue = (valueLocation, isArrayItem = false) => {
    if ((token.kind === "{" || token.kind === "[") && depth >= MAX_DEPTH) {
      return parseTooDeep(valueLocation);
    }

    switch (token.kind) {
      case "{":
        return parseContainer("object", valueLocation, isArrayItem);

      case "[":
        return parseContainer("array", valueLocation, isArrayItem);

      case "string":
        if (token.quote === "'") {
          report("string-single-quoted", token.offset, token.length);
        }
        return parseScalar("string", token.value, valueLocation);

      case "number":
        if (!NUMBER.test(token.value)) {
          report("number-invalid", token.offset, token.length, token.value);
          return parseInvalid(valueLocation);
        }
        return parseScalar("number", Number(token.value), valueLocation);

      case "true":
        return parseScalar("boolean", true, valueLocation);

      case "false":
        return parseScalar("boolean", false, valueLocation);

      case "null":
        return parseScalar("null", null, valueLocation);

      case "unknown":
        report("invalid-literal", token.offset, token.length, token.value);
        return parseInvalid(valueLocation);

      default:
        return undefined;
    }
  };

  next();

  const rootLocation = `${location}#`;

  /** @type JsonValueNode | undefined */
  let node;
  if (kind() === "eof") {
    report("value-expected", 0, 0);
    node = missing(rootLocation, 0);
  } else {
    const root = parseValue(rootLocation);
    node = root ? revive(root, undefined) : missing(rootLocation, 0);

    if (kind() !== "eof") {
      report("end-of-file-expected", token.offset, Math.max(text.trimEnd().length - token.offset, 1));
      failed = true;
    }
  }

  errors.sort((a, b) => a.offset - b.offset);
  const messages = withoutStackTraces(() => errors.map((error) => {
    const message = new VFileMessage(MESSAGES[error.code](error.found), {
      place: position(error.offset, error.offset + error.length),
      ruleId: error.code,
      source: "json"
    });
    if (error.found !== undefined) {
      message.actual = error.found;
    }
    return message;
  }));

  /** @type JsonParseStatus */
  const status = messages.length === 0 ? "success" : failed ? "failure" : "recovered";

  // The status is what decides the type of the node, which is checked by the
  // tests rather than the type system
  return /** @type JsonParseResult<any, any> */ ({ status, node, messages, comments });
};

/** @type (text: string) => number[] */
const findLineStarts = (text) => {
  const lineStarts = [0];

  // Lines almost always end with "\n", which can be found quickly
  if (!text.includes("\r")) {
    let index = text.indexOf("\n");
    while (index !== -1) {
      lineStarts.push(index + 1);
      index = text.indexOf("\n", index + 1);
    }
    return lineStarts;
  }

  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\r" && text[index + 1] === "\n") {
      index++;
    }
    if (text[index] === "\n" || text[index] === "\r") {
      lineStarts.push(index + 1);
    }
  }
  return lineStarts;
};
