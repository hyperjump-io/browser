import moo from "moo";

/**
 * @import { Token } from "moo"
 * @import { Point } from "unist"
 */


/**
 * @typedef {"null" | "boolean" | "number" | "string" | "{" | "}" | "[" | "]" | ":" | ","} JsonTokenType
 */

/**
 * @template {JsonTokenType} [T=JsonTokenType]
 * @typedef {{ [K in T]: Token & { type: K }; }[T]} JsonToken
 */

/**
 * @typedef {Generator<JsonToken>} JsonLexer
 */

// String
const unescaped = `[\\x20-\\x21\\x23-\\x5b\\x5d-\\u{10ffff}]`;
const escape = `\\\\`;
const hexdig = `[0-9a-fA-F]`;
const escaped = `${escape}(?:["\\/\\\\brfnt]|u${hexdig}{4})`;
const char = `(?:${unescaped}|${escaped})`;
const string = `"${char}*"`;

// Number
const digit = `[0-9]`;
const digit19 = `[1-9]`;
const int = `(?:0|${digit19}${digit}*)`;
const frac = `\\.${digit}+`;
const e = `[eE]`;
const exp = `${e}[-+]?${digit}+`;
const number = `-?${int}(?:${frac})?(?:${exp})?`;

// Whitespace
const whitespace = `(?:(?:\\r?\\n)|[ \\t])+`;

const lexer = moo.compile({
  WS: { match: new RegExp(whitespace, "u"), lineBreaks: true },
  boolean: ["true", "false"],
  null: "null",
  number: { match: new RegExp(number, "u") },
  string: { match: new RegExp(string, "u") },
  "{": "{",
  "}": "}",
  "[": "[",
  "]": "]",
  ":": ":",
  ",": ",",
  error: moo.error
});

/** @type (json: string) => JsonLexer */
export const jsonLexer = function* (json) {
  for (const token of lexer.reset(json)) {
    if (token.type === "WS") {
      continue;
    }

    yield /** @type JsonToken */ (token);
  }
};

/** @type (token?: Token) => Point */
export const place = (token) => {
  return {
    // @ts-expect-error Line exists in the lexer but isn't included in the type
    line: token?.line ?? lexer.line, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    // @ts-expect-error Line exists in the lexer but isn't included in the type
    column: token?.col ?? lexer.col // eslint-disable-line @typescript-eslint/no-unsafe-assignment
  };
};
