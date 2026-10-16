import { withoutStackTraces } from "./without-stack-traces.js";

/**
 * @import { Parser } from "unified"
 * @import { VFileMessage } from "vfile-message"
 * @import { JsonParseStatus } from "./jsonast.d.ts"
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
 * @type (file: VFile, messages: VFileMessage[], status: JsonParseStatus, accept?: JsonParseStatus) => void
 */
export const reportSyntaxErrors = (file, messages, status, accept = "success") => {
  const fileMessages = withoutStackTraces(() => messages.map((error) => {
    const message = file.message(error.reason, {
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
