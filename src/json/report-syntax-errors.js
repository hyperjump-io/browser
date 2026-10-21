import { VFileMessage } from "vfile-message";
import { jsonSyntaxErrorMessage } from "./json-parser.js";
import { withoutStackTraces } from "./without-stack-traces.js";

/**
 * @import { Parser } from "unified"
 * @import { JsonParseStatus } from "./jsonast.d.ts"
 * @import { JsonSyntaxError } from "./jsonast-util.d.ts"
 */

/** @typedef {Parameters<Parser>[1]} VFile */

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
 * @type (file: VFile, errors: JsonSyntaxError[], status: JsonParseStatus, accept?: JsonParseStatus) => void
 */
export const reportSyntaxErrors = (file, errors, status, accept = "success") => {
  const fileMessages = withoutStackTraces(() => errors.map((error) => {
    const message = file.message(jsonSyntaxErrorMessage(error), {
      place: error.place,
      ruleId: error.ruleId,
      source: error.source
    });
    message.actual = error.actual;
    return message;
  }));

  if (STATUS_RANK[status] > STATUS_RANK[accept]) {
    fileMessages[0].fatal = true;
    throw fileMessages[0];
  }
};

/**
 * A syntax error as a fatal message, to throw when a document can't be used
 *
 * @type (error: JsonSyntaxError) => VFileMessage
 */
export const fatalSyntaxError = (error) => withoutStackTraces(() => {
  const message = new VFileMessage(jsonSyntaxErrorMessage(error), {
    place: error.place,
    ruleId: error.ruleId,
    source: error.source
  });
  message.actual = error.actual;
  message.fatal = true;
  return message;
});
