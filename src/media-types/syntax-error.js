import { relativeFileUrl } from "../file-urls.js";

/**
 * @import { Position } from "unist"
 */

/**
 * The error a plugin throws for a document that can't be used because of a
 * syntax error. Its message says what's wrong and where, and its `cause` is
 * the syntax error, which is plain data with a `ruleId` and a `place`.
 *
 * @type <E extends { place: Position }>(error: E, message: (error: E) => string, url: string) => SyntaxError
 */
export const documentSyntaxError = (error, message, url) => {
  const { line, column } = error.place.start;
  return new SyntaxError(`${message(error)} at ${relativeFileUrl(url)}:${line}:${column}`, { cause: error });
};
