import { fromJson, jsonSyntaxErrorMessage } from "../json/jsonast-util.js";
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
    const result = fromJson(await response.text(), response.url);
    if (result.status !== "success") {
      throw documentSyntaxError(result.errors[0], jsonSyntaxErrorMessage, response.url);
    }

    return {
      type: "json-document",
      status: result.status,
      children: [result.node],
      comments: [],
      url: response.url
    };
  }
});
