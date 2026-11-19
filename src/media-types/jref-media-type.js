import { hasStatus, fromJref, jrefSyntaxErrorMessage } from "../jref/jref-util.js";
import { documentSyntaxError } from "./syntax-error.js";

/**
 * @import * as API from "./jref-media-type.d.ts"
 */

/** @type typeof API.jrefMediaType */
export const jrefMediaType = Object.freeze({
  mediaType: "application/reference+json",
  // Frozen too, so changing a copy of the plugin can't change the built-in
  extensions: Object.freeze([".jref"]),

  /** @type typeof API.jrefMediaType.parse */
  parse: async (response) => {
    const { document, errors } = fromJref(await response.text(), response.url);
    if (!hasStatus(document, "success")) {
      throw documentSyntaxError(errors[0], jrefSyntaxErrorMessage, response.url);
    }
    return document;
  }
});
