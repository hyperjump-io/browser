import { hasStatus, fromJson, jsonSyntaxErrorMessage } from "../json/jsonast-util.js";
import { documentSyntaxError } from "./syntax-error.js";

/**
 * @import * as API from "./json-media-type.d.ts"
 */

/** @type typeof API.jsonMediaType */
export const jsonMediaType = Object.freeze({
  mediaType: "application/json",
  extensions: [".json"],

  /** @type typeof API.jsonMediaType.parse */
  parse: async (response) => {
    const { document, errors } = fromJson(await response.text(), response.url);
    if (!hasStatus(document, "success")) {
      throw documentSyntaxError(errors[0], jsonSyntaxErrorMessage, response.url);
    }
    return document;
  }
});
