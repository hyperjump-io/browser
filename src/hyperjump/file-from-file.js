import { relativeFileUrl } from "./file-urls.js";
import { problemResponse } from "./problem-details.js";

/**
 * @import { Layer } from "./layers.js"
 */

/**
 * The `file:` from `file:` layer. A document from somewhere else, like the
 * web, can't make the application read a file, so a request for a `file:`
 * URL whose `Referer` isn't a `file:` URL is answered with a 403. A request
 * without a `Referer`, like a URL an application passes to `get`, isn't a
 * reference, so it's allowed.
 *
 * @type Layer
 */
export const fileFromFileLayer = (next) => async (request) => {
  const referer = request.headers.get("referer");
  if (request.url.startsWith("file:") && referer !== null && !referer.startsWith("file:")) {
    return problemResponse(request.url, 403, "Forbidden", `Accessing a file (${relativeFileUrl(request.url)}) from a non-filesystem context (${referer}) is not allowed`);
  }

  return next(request);
};
