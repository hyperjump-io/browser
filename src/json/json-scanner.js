/**
 * @typedef {"{" | "}" | "[" | "]" | ":" | "," | "string" | "number" | "true" | "false" | "null" | "unknown" | "comment" | "eof"} JsonTokenKind
 */

/**
 * @typedef {{
 *   code: "string-not-closed" | "invalid-escape" | "invalid-character";
 *   offset: number;
 *   length: number;
 * }} ScanError
 */

/**
 * @typedef {{
 *   kind: JsonTokenKind;
 *   offset: number;
 *   length: number;
 *   value: string;
 *   quote: "\"" | "'" | undefined;
 *   errors: readonly ScanError[];
 *   reachedEndOfFile: boolean;
 * }} JsonToken
 *
 * `reachedEndOfFile` is set for a string or block comment that ran to the end
 * of the text without being closed.
 */

// Most tokens have no errors, so they share one array instead of allocating
/** @type readonly ScanError[] */
const NO_ERRORS = Object.freeze([]);

const SPACE = 0x20;
const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const DOUBLE_QUOTE = 0x22;
const SINGLE_QUOTE = 0x27;
const SLASH = 0x2f;
const ASTERISK = 0x2a;
const BACKSLASH = 0x5c;

/** @type (code: number) => boolean */
const isWhitespace = (code) => code === SPACE || code === LINE_FEED || code === CARRIAGE_RETURN || code === TAB;

// Characters that end a number or a bare word, indexed by character code
const TERMINATORS = new Uint8Array(128);
for (const character of " \t\n\r{}[]:,\"'/") {
  TERMINATORS[character.charCodeAt(0)] = 1;
}

/** @type Record<number, JsonTokenKind> */
const PUNCTUATORS = {
  0x7b: "{",
  0x7d: "}",
  0x5b: "[",
  0x5d: "]",
  0x3a: ":",
  0x2c: ","
};

/** @type (code: number) => boolean */
const isNumberStart = (code) => (code >= 0x30 && code <= 0x39) || code === 0x2d || code === 0x2b || code === 0x2e;

/** @type Record<string, string> */
const ESCAPES = {
  "\"": "\"",
  "\\": "\\",
  "/": "/",
  "b": "\b",
  "f": "\f",
  "n": "\n",
  "r": "\r",
  "t": "\t"
};

/** @type (code: number) => boolean */
const isHexDigit = (code) => (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x46) || (code >= 0x61 && code <= 0x66);

/**
 * Scan the token that starts at `offset`, skipping any whitespace before it.
 * Scanning never fails. Anything that isn't valid JSON is still returned as a
 * token so the parser can decide how to report it.
 *
 * @type (text: string, offset: number) => JsonToken
 */
export const scanToken = (text, offset) => {
  const length = text.length;
  while (offset < length && isWhitespace(text.charCodeAt(offset))) {
    offset++;
  }

  if (offset >= length) {
    return token("eof", offset, 0, "");
  }

  const code = text.charCodeAt(offset);

  const punctuator = PUNCTUATORS[code];
  if (punctuator !== undefined) {
    return token(punctuator, offset, 1, punctuator);
  }

  if (code === DOUBLE_QUOTE || code === SINGLE_QUOTE) {
    return scanString(text, offset, code);
  }

  if (code === SLASH) {
    const next = text.charCodeAt(offset + 1);
    if (next === SLASH) {
      let end = offset + 2;
      while (end < length) {
        const lineCode = text.charCodeAt(end);
        if (lineCode === LINE_FEED || lineCode === CARRIAGE_RETURN) {
          break;
        }
        end++;
      }
      return token("comment", offset, end - offset, text.slice(offset, end));
    }

    if (next === ASTERISK) {
      const close = text.indexOf("*/", offset + 2);
      const end = close === -1 ? length : close + 2;
      const result = token("comment", offset, end - offset, text.slice(offset, end));
      result.reachedEndOfFile = close === -1;
      return result;
    }
  }

  let end = offset + 1;
  while (end < length) {
    const wordCode = text.charCodeAt(end);
    if (wordCode < 128 && TERMINATORS[wordCode]) {
      break;
    }
    end++;
  }

  const word = text.slice(offset, end);
  if (isNumberStart(code)) {
    return token("number", offset, end - offset, word);
  }

  const kind = word === "true" || word === "false" || word === "null" ? word : "unknown";
  return token(kind, offset, end - offset, word);
};

/**
 * Every token has the same shape so property access stays fast.
 *
 * @type (kind: JsonTokenKind, offset: number, length: number, value: string) => JsonToken
 */
const token = (kind, offset, length, value) => {
  return {
    kind: kind,
    offset: offset,
    length: length,
    value: value,
    quote: undefined,
    errors: NO_ERRORS,
    reachedEndOfFile: false
  };
};

/** @type (text: string, offset: number, quoteCode: number) => JsonToken */
const scanString = (text, offset, quoteCode) => {
  const length = text.length;

  /** @type ScanError[] | undefined */
  let errors;
  let value = "";
  let position = offset + 1;

  // Unescaped text is copied in chunks rather than a character at a time
  let chunkStart = position;
  let closed = false;

  while (position < length) {
    const code = text.charCodeAt(position);

    if (code === quoteCode) {
      value += text.slice(chunkStart, position);
      position++;
      closed = true;
      break;
    }

    // An unterminated string ends at the end of the line
    if (code === LINE_FEED || code === CARRIAGE_RETURN) {
      break;
    }

    if (code === BACKSLASH) {
      value += text.slice(chunkStart, position);

      const escaped = text[position + 1];
      if (escaped === undefined || escaped === "\n" || escaped === "\r") {
        value += "\\";
        position++;
      } else if (escaped in ESCAPES) {
        value += ESCAPES[escaped];
        position += 2;
      } else if (escaped === "'" && quoteCode === SINGLE_QUOTE) {
        value += escaped;
        position += 2;
      } else if (escaped === "u") {
        let digits = 0;
        while (digits < 4 && isHexDigit(text.charCodeAt(position + 2 + digits))) {
          digits++;
        }

        const escapeLength = 2 + digits;
        if (digits === 4) {
          value += String.fromCharCode(parseInt(text.slice(position + 2, position + 6), 16));
        } else {
          (errors ??= []).push({ code: "invalid-escape", offset: position, length: escapeLength });
          value += text.slice(position, position + escapeLength);
        }
        position += escapeLength;
      } else {
        (errors ??= []).push({ code: "invalid-escape", offset: position, length: 2 });
        value += "\\" + escaped;
        position += 2;
      }

      chunkStart = position;
      continue;
    }

    if (code < 0x20) {
      (errors ??= []).push({ code: "invalid-character", offset: position, length: 1 });
    }

    position++;
  }

  if (!closed) {
    value += text.slice(chunkStart, position);
    (errors ??= []).unshift({ code: "string-not-closed", offset: offset, length: position - offset });
  }

  return {
    kind: "string",
    offset: offset,
    length: position - offset,
    value: value,
    quote: quoteCode === DOUBLE_QUOTE ? "\"" : "'",
    errors: errors ?? NO_ERRORS,
    reachedEndOfFile: !closed && position >= length
  };
};
