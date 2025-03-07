import moo from "moo";
import { VFileMessage } from "vfile-message";

/**
 * @import { Lexer, Token } from "moo"
 */


/**
 * @typedef {"null" | "boolean" | "number" | "string" | "{" | "}" | "[" | "]" | ":" | ","} JsonTokenType
 */

/**
 * @template {JsonTokenType} [T=JsonTokenType]
 * @typedef {{ [K in T]: Token & { type: K }; }[T]} JsonToken
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

export class JsonLexer {
  /** @type Lexer */
  #lexer;

  /** @type Generator<JsonToken<JsonTokenType>, void, undefined> */
  #iterator;

  /**
   * @param {string} json
   */
  constructor(json) {
    this.#lexer = moo.compile({
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

    this.#iterator = (function* (lexer) {
      for (const token of lexer.reset(json)) {
        if (token.type === "WS") {
          continue;
        }

        yield /** @type JsonToken */ (token);
      }
    }(this.#lexer));
  }

  /** @type () => JsonToken */
  nextToken() {
    const result = this.#iterator.next();
    if (result.done) {
      throw this.syntaxError("No more tokens");
    }

    return result.value;
  };

  done() {
    if (!this.#iterator.next().done) {
      throw this.syntaxError("Additional tokens found");
    }
  }

  /** @type (message: string, token?: JsonToken) => VFileMessage */
  syntaxError(message, token) {
    throw new VFileMessage(message, {
      source: "json",
      ruleId: "syntax-error",
      place: {
        // @ts-expect-error Line exists in the lexer but isn't included in the type
        line: token?.line ?? this.#lexer.line, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
        // @ts-expect-error Line exists in the lexer but isn't included in the type
        column: token?.col ?? this.#lexer.col // eslint-disable-line @typescript-eslint/no-unsafe-assignment
      }
    });
  };
}
