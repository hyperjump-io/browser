import { fromJref, jrefSyntaxErrorMessage } from "../jref/jref-util.js";
import { documentSyntaxError } from "./syntax-error.js";

/**
 * @import * as API from "./jref-media-type.d.ts"
 */

/** @type typeof API.jrefMediaType */
export const jrefMediaType = Object.freeze({
  mediaType: "application/reference+json",
  extensions: [".jref"],

  /** @type typeof API.jrefMediaType.parse */
  parse: async (response) => {
    const result = fromJref(await response.text(), response.url);
    if (result.status !== "success") {
      throw documentSyntaxError(result.errors[0], jrefSyntaxErrorMessage, response.url);
    }

    return {
      type: "jref-document",
      status: result.status,
      children: [result.node],
      comments: [],
      url: response.url
    };
  },

  fragmentPointer: (_document, fragment) => decodeURIComponent(fragment)
});
