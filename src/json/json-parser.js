import { emptyToken, scanToken } from "./json-scanner.js";
import { appendToLocation } from "./location.js";

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
 *   JsonPropertyNode,
 *   JsonTolerantNode
 * } from "./jsonast.d.ts"
 * @import { JsonOptions, JsonSyntaxError, JsonSyntaxErrorCode } from "./jsonast-util.d.ts"
 * @import * as API from "./jsonast-util.d.ts"
 */

/**
 * @typedef {JsonTolerantNode | JsonErrorNode} JsonValueNode
 */

/**
 * @typedef {Extract<JsonTolerantNode, { jsonType: "object" }>} JsonTolerantObjectNode
 */

/**
 * What a parse found: the root value, how parsing went, and the errors and
 * comments. `fromJson` and `fromJref` make a document of it.
 *
 * @typedef {{
 *   status: JsonParseStatus,
 *   node: JsonValueNode,
 *   errors: JsonSyntaxError[],
 *   comments: JsonCommentNode[]
 * }} ParsedJson
 */

/**
 * @typedef {{ jsonType: "null", value: null }
 *   | { jsonType: "boolean", value: boolean }
 *   | { jsonType: "number", value: number }
 *   | { jsonType: "string", value: string }} JsonScalar
 */

/**
 * @typedef {{
 *   code: JsonSyntaxErrorCode;
 *   offset: number;
 *   length: number;
 *   found?: string;
 * }} SyntaxError
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
  "number-out-of-range": (found) => `'${found}' is too big to be a number`,
  "invalid-literal": (found) => `'${found}' is not a valid value`,
  "comment-not-allowed": () => "Comments are not allowed in JSON",
  "comment-not-closed": () => "Comment is missing its closing '*/'",
  "byte-order-mark": () => "A byte order mark isn't allowed at the start of JSON",
  "max-depth-exceeded": () => `Objects and arrays can't be nested more than ${MAX_DEPTH} levels deep`
};

// RFC 8259 allows a limit on nesting depth. Without one, deeply nested input
// would overflow the call stack. A walk that follows references is limited
// to it too, by default.
export const MAX_DEPTH = 1000;

const NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?$/;

/** @type Set<JsonTokenKind> */
const KEY_STARTS = new Set(["string", "number", "true", "false", "null", "unknown"]);

/** @type typeof API.jsonSyntaxErrorMessage */
export const jsonSyntaxErrorMessage = (error) => MESSAGES[error.ruleId](error.actual);

/**
 * Parse JSON text into a JSON AST, recovering from syntax errors wherever
 * possible. Every error found is returned along with the best-effort AST.
 *
 * `onObject` is told of each object when it's parsed, inner ones first, so
 * `fromJref` makes references while the object is still in the CPU's cache.
 * It's told, not asked: what it returns isn't used.
 *
 * @type (text: string, url: string, options?: JsonOptions, onObject?: (node: JsonTolerantObjectNode) => void) => ParsedJson
 */
export const parseJson = (text, url, options = {}, onObject) => {
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

  // RFC 8259 lets a parser ignore a byte order mark, which a decoder that
  // isn't the Encoding Standard's, like `readFile`'s, leaves at the start.
  // The tree has everything, so it's recovered.
  const hasByteOrderMark = text.startsWith("\uFEFF");

  // The scanner writes each token into one of these instead of making an
  // object for it. Lookahead has its own, so the current token is kept.
  /** @type JsonToken */
  let token = emptyToken(hasByteOrderMark ? 1 : 0);
  const ahead = emptyToken(0);
  let previousOffset = 0;
  let previousLength = 0;

  /** @type (code: JsonSyntaxErrorCode, offset: number, length: number, found?: string) => void */
  const report = (code, offset, length, found) => {
    errors.push({ code, offset, length, found });
  };

  if (hasByteOrderMark) {
    report("byte-order-mark", 0, 1);
  }

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
  // point is kept, and lines are found going forward from it. A point
  // before it searches a table of every line's start, which is made only
  // then, or when lines end with "\r".
  /** @type number[] | undefined */
  let lineStarts = text.includes("\r") ? findLineStarts(text) : undefined;
  let lastLine = 0;
  let lastLineStart = 0;
  let nextLineStart = lineStarts
    ? (lineStarts.length > 1 ? lineStarts[1] : Infinity)
    : lineStartAfter(text, 0);

  /** @type (offset: number) => Point */
  const point = (offset) => {
    if (offset >= nextLineStart && !lineStarts) {
      do {
        lastLine++;
        lastLineStart = nextLineStart;
        nextLineStart = lineStartAfter(text, lastLineStart);
      } while (offset >= nextLineStart);
    } else if (offset < lastLineStart || offset >= nextLineStart) {
      lineStarts ??= findLineStarts(text);
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
      lastLine = low;
      lastLineStart = lineStarts[low];
      nextLineStart = low + 1 < lineStarts.length ? lineStarts[low + 1] : Infinity;
    }

    return { line: lastLine + 1, column: offset - lastLineStart + 1, offset: offset };
  };

  /** @type (start: number, end: number) => Position */
  const position = (start, end) => {
    return { start: point(start), end: point(end) };
  };

  // A node that has others in it ends after them, so its start point is
  // found before them. Points are found quickly only in document order.
  /** @type (start: Point, end: number) => Position */
  const positionFrom = (start, end) => {
    return { start: start, end: point(end) };
  };

  /** @type (offset: number) => Position */
  const emptyPosition = (offset) => {
    const at = point(offset);
    return { start: at, end: at };
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

  /** @type (offset: number) => JsonToken */
  const scanSignificant = (offset) => {
    let result = scanToken(text, offset, ahead);
    while (result.kind === "comment") {
      result = scanToken(text, result.offset + result.length, ahead);
    }
    return result;
  };

  const next = () => {
    previousOffset = token.offset;
    previousLength = token.length;

    for (;;) {
      token = scanToken(text, token.offset + token.length, token);

      // Most tokens have none
      if (token.errors.length > 0) {
        for (const error of token.errors) {
          report(error.code, error.offset, error.length);
        }
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

  /** @type (code: JsonSyntaxErrorCode, container: JsonTolerantNode, lastItem: { position?: Position } | undefined) => void */
  const reportNotClosed = (code, container, lastItem) => {
    unclosed.add(container);
    if (ranToEndOfFile) {
      return;
    }

    if (lastItem) {
      // The last item can be an unclosed container that covers whitespace,
      // which ends after the last token. Trimming its text instead would go
      // over the same whitespace for every container it's in.
      const end = Math.min(endOf(lastItem), previousOffset + previousLength);
      report(code, startOf(lastItem), end - startOf(lastItem));
    } else {
      report(code, startOf(container), 1);
    }
  };

  /** @type (after: { position?: Position } | undefined, offset: number, length: number) => void */
  const reportCommaExpected = (after, offset, length) => {
    if (after && !unclosed.has(after)) {
      report("comma-expected", offset, Math.max(length, 1));
    }
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

  /** @type (nodeLocation: string, offset: number) => JsonMissingNode */
  const missing = (nodeLocation, offset) => {
    failed = true;
    return {
      type: "json-missing",
      location: nodeLocation,
      position: emptyPosition(offset)
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

  /**
   * The type and the value are separate arguments, which is faster than an
   * object of them, so the type doesn't know they're a pair
   *
   * @type (jsonType: JsonScalar["jsonType"], value: JsonScalar["value"], nodeLocation: string) => JsonTolerantNode
   */
  const parseScalar = (jsonType, value, nodeLocation) => {
    const node = /** @type JsonTolerantNode */ ({
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
   * Parse a property. A value that's missing is a `json-missing` node.
   *
   * @type (objectLocation: string) => JsonPropertyNode<{ type: "json" }, JsonErrorNode>
   */
  const parseProperty = (objectLocation) => {
    const startPoint = point(token.offset);

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
        position: emptyPosition(token.offset)
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
        position: positionFrom(startPoint, token.offset + token.length)
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

    const valueLocation = appendToLocation(keyNode.value, objectLocation);
    const value = looksLikeProperty() ? undefined : parseValue(valueLocation);
    if (!value) {
      if (colonOffset === undefined) {
        reportAtPrevious("value-expected");
      } else {
        report("value-expected", colonOffset, 1);
      }

      // The missing value has no width, but the property extends to where
      // parsing stopped so the cursor is inside it while typing the value
      const missingNode = missing(valueLocation, previousOffset + previousLength);
      /** @type JsonPropertyNode<{ type: "json" }, JsonErrorNode> */
      const property = {
        type: "json-property",
        children: [keyNode, missingNode],
        position: positionFrom(startPoint, token.offset)
      };
      return property;
    }

    /** @type JsonPropertyNode<{ type: "json" }, JsonErrorNode> */
    const property = {
      type: "json-property",
      children: [keyNode, value],
      position: { start: startPoint, end: /** @type Position */ (value.position).end }
    };
    return property;
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

      /** @type {{ kind: JsonTokenKind, offset: number }[]} */
      const openers = [];
      let scanned = scanSignificant(0);
      while (scanned.kind !== "eof") {
        if (scanned.kind === "{" || scanned.kind === "[") {
          openers.push({ kind: scanned.kind, offset: scanned.offset });
        } else if (scanned.kind === "}" || scanned.kind === "]") {
          const match = scanned.kind === "}" ? "{" : "[";
          while (openers.length > 0 && openers[openers.length - 1].kind !== match) {
            containerEnds.set(/** @type {{ offset: number }} */ (openers.pop()).offset, scanned.offset);
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

  /** @type (jsonType: "object" | "array", containerLocation: string, isArrayItem: boolean) => JsonTolerantNode */
  const parseContainer = (jsonType, containerLocation, isArrayItem) => {
    depth++;
    const startPoint = point(token.offset);
    const closer = jsonType === "object" ? "}" : "]";
    next();

    // Only the array of the container's kind is made, since one for each
    // kind was a cost of every container
    /** @type {(JsonPropertyNode<{ type: "json" }, JsonErrorNode> | JsonValueNode)[]} */
    const children = [];

    /** @type {{ position?: Position } | undefined} */
    let lastItem;
    let index = 0;

    // Where a comma is expected, after an item or stray colons, and the
    // token before it. They're variables and not an object, since an
    // object for each item was a cost of every container.
    let separated = false;
    /** @type {{ position?: Position } | undefined} */
    let separatorAfter;
    let separatorOffset = 0;
    let separatorLength = 0;
    while (!isEndOfContainer()) {
      if (token.kind === ",") {
        const gapOffset = parseComma(closer, !separated, index === 0);
        if (gapOffset !== undefined && jsonType === "array") {
          // An index never needs escaping or encoding
          children.push(missing(`${containerLocation}/${index}`, gapOffset));
        }
        if (gapOffset !== undefined) {
          index++;
        }
        separated = false;
        continue;
      }

      if (jsonType === "array" && token.kind === ":") {
        skipStrayColons();
        if (!separated) {
          separated = true;
          separatorAfter = undefined;
          separatorOffset = previousOffset;
          separatorLength = previousLength;
        }
        continue;
      }

      if (separated) {
        reportCommaExpected(separatorAfter, separatorOffset, separatorLength);
      }

      if (jsonType === "array" && looksLikeProperty()) {
        break;
      }

      if (jsonType === "object" && isArrayItem && startsNextArrayItem()) {
        break;
      }

      if (jsonType === "object") {
        index++;
        const property = parseProperty(containerLocation);
        children.push(property);
        lastItem = property;
        // A property's value is missing only when it wasn't there to parse
        const value = property.children[1];
        separatorAfter = value.type === "json-missing" ? undefined : value;
      } else {
        // Every token that isn't a value was handled above
        const item = /** @type JsonValueNode */ (parseValue(`${containerLocation}/${index++}`, true));
        children.push(item);
        lastItem = item;
        separatorAfter = item;
      }
      separated = true;
      separatorOffset = previousOffset;
      separatorLength = previousLength;
    }

    // An unclosed container extends to where parsing stopped, including any
    // whitespace after its last token. Editors look up the node at the
    // cursor, and while typing at the end of a truncated document, the
    // cursor is usually in that whitespace.
    const isClosed = token.kind === closer;
    const containerPosition = positionFrom(startPoint, isClosed ? token.offset + token.length : token.offset);

    // The children were pushed by kind above, so they're the container's
    const container = /** @type JsonTolerantNode */ ({
      type: "json",
      jsonType: jsonType,
      children: children,
      location: containerLocation,
      position: containerPosition
    });
    if (jsonType === "object" && onObject) {
      onObject(/** @type JsonTolerantObjectNode */ (container));
    }

    if (isClosed) {
      next();
    } else {
      reportNotClosed(jsonType === "object" ? "brace-not-closed" : "bracket-not-closed", container, lastItem);
    }
    depth--;
    return container;
  };

  /** @type (valueLocation: string, isArrayItem?: boolean) => JsonTolerantNode | JsonInvalidNode | undefined */
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
        // RFC 8259 allows a limit on a number's range. One past a
        // JavaScript number's would be Infinity, which isn't JSON, so it
        // couldn't be written back. One too small to be a number is 0.
        const number = Number(token.value);
        if (!Number.isFinite(number)) {
          report("number-out-of-range", token.offset, token.length, token.value);
          return parseInvalid(valueLocation);
        }
        return parseScalar("number", number, valueLocation);

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

  const rootLocation = `${url}#`;

  /** @type JsonValueNode | undefined */
  let node;
  if (kind() === "eof") {
    report("value-expected", 0, 0);
    node = missing(rootLocation, 0);
  } else {
    const root = parseValue(rootLocation);
    node = root ?? missing(rootLocation, 0);

    if (kind() !== "eof") {
      report("end-of-file-expected", token.offset, Math.max(text.trimEnd().length - token.offset, 1));
      failed = true;
    }
  }

  errors.sort((a, b) => a.offset - b.offset);
  const syntaxErrors = errors.map((error) => {
    /** @type JsonSyntaxError */
    const syntaxError = {
      source: "json",
      ruleId: error.code,
      place: position(error.offset, error.offset + error.length)
    };
    if (error.found !== undefined) {
      syntaxError.actual = error.found;
    }
    return syntaxError;
  });

  /** @type JsonParseStatus */
  const status = syntaxErrors.length === 0 ? "success" : failed ? "failure" : "recovered";

  return { status, node, errors: syntaxErrors, comments };
};

/** @type (text: string, offset: number) => number */
const lineStartAfter = (text, offset) => {
  const index = text.indexOf("\n", offset);
  return index === -1 ? Infinity : index + 1;
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
