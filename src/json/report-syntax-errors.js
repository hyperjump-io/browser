import { VFileMessage } from "vfile-message";

/**
 * @import { Parser } from "unified"
 * @import { Position } from "unist"
 * @import { JsonParseStatus } from "./jsonast.d.ts"
 */

/** @typedef {Parameters<Parser>[1]} VFile */

/**
 * A syntax error from any parser, like a `JsonSyntaxError`, which `message`
 * describes for people
 *
 * @typedef {{ source: string, ruleId: string, place: Position, actual?: string }} ParserError
 */

/** @type Record<JsonParseStatus, number> */
const STATUS_RANK = {
  success: 0,
  recovered: 1,
  failure: 2
};

/**
 * Add every syntax error to a file as a message. If the parse status is worse
 * than the accepted status, the first error fails the file.
 *
 * @type <E extends ParserError>(file: VFile, errors: E[], message: (error: E) => string, status: JsonParseStatus, accept?: JsonParseStatus) => void
 */
export const reportSyntaxErrors = (file, errors, message, status, accept = "success") => {
  const fileMessages = withoutStackTraces(() => errors.map((error) => {
    const fileMessage = file.message(message(error), {
      place: error.place,
      ruleId: error.ruleId,
      source: error.source
    });
    fileMessage.actual = error.actual;
    return fileMessage;
  }));

  if (STATUS_RANK[status] > STATUS_RANK[accept]) {
    fileMessages[0].fatal = true;
    throw fileMessages[0];
  }
};

/**
 * A syntax error as a fatal message, to throw when a document can't be used
 *
 * @type <E extends ParserError>(error: E, message: (error: E) => string) => VFileMessage
 */
export const fatalSyntaxError = (error, message) => withoutStackTraces(() => {
  const fileMessage = new VFileMessage(message(error), {
    place: error.place,
    ruleId: error.ruleId,
    source: error.source
  });
  fileMessage.actual = error.actual;
  fileMessage.fatal = true;
  return fileMessage;
});

/**
 * Run `fn` without capturing stack traces for any errors it creates.
 *
 * A VFileMessage is an Error, so creating one captures a stack trace. For a
 * syntax error, that trace doesn't say anything about the problem and it's the
 * most expensive part of creating the message. `Error.stackTraceLimit` is
 * only supported by V8. Elsewhere, setting it has no effect.
 *
 * @type <T>(fn: () => T) => T
 */
const withoutStackTraces = (fn) => {
  const stackTraceLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 0;
  try {
    return fn();
  } finally {
    Error.stackTraceLimit = stackTraceLimit;
  }
};
