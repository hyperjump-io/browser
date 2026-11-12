import { relativeFileUrl } from "../file-urls.js";

/**
 * @import { Position } from "unist"
 */

/**
 * The error a plugin throws for a document that can't be used because of a
 * syntax error. Its message says what's wrong and where. Its `cause` is the
 * syntax error, which is plain data with a `ruleId` and a `place`, with the
 * `code` every syntax error has, and its `url` is the document's.
 *
 * @type <E extends { place: Position }>(error: E, message: (error: E) => string, url: string) => SyntaxError & { url: string }
 */
export const documentSyntaxError = (error, message, url) => {
  const { line, column } = error.place.start;
  const cause = { code: "ERR_SYNTAX", ...error };
  return Object.assign(new SyntaxError(`${message(error)} at ${relativeFileUrl(url)}:${line}:${column}`, { cause }), { url });
};
