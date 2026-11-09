import { matchesUrlEntry, resolveUrlEntry } from "./url-entries.js";

/**
 * @import { Layer } from "./layers.js"
 */

/** The statuses whose response is a representation, which has a media type */
const successStatuses = new Set([200, 203]);

/**
 * Check the `mediaTypeByExtension` config's URLs
 *
 * @type (entries: string[]) => string[]
 */
export const resolveExtensionUrls = (entries) => {
  return entries.map((entry) => resolveUrlEntry(entry, "'mediaTypeByExtension' config"));
};

/**
 * The media type by extension layer. A file doesn't have a media type, so a
 * `file:` response gets the media type of its URL's extension. So does a
 * response from one of the `mediaTypeByExtension` config's URLs, for a
 * server that sends the wrong `Content-Type`. It replaces a wrong type as
 * well as a missing one. When no media type plugin has the extension, the
 * response keeps the type it has.
 *
 * It's matched by the URL the response came from, because that's what
 * sent the wrong type. The extension is the path's, without the query,
 * which a URL like a private GitHub raw URL has. Only a success is a
 * representation, so an error, like a refusal's Problem Details, keeps its
 * type.
 *
 * @type (urls: string[], mediaTypeOf: (url: string) => string | undefined) => Layer
 */
export const mediaTypeByExtensionLayer = (urls, mediaTypeOf) => (next) => async (request) => {
  const response = await next(request);
  if (!successStatuses.has(response.status)) {
    return response;
  }

  const url = new URL(response.url);
  url.hash = "";
  if (url.protocol !== "file:" && !urls.some((entry) => matchesUrlEntry(entry, url.href))) {
    return response;
  }

  url.search = "";
  const mediaType = mediaTypeOf(url.href);
  if (mediaType === undefined) {
    return response;
  }

  // A response from `fetch` can't have its headers changed
  const headers = new Headers(response.headers);
  headers.set("content-type", mediaType);
  const typed = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  Object.defineProperty(typed, "url", { value: response.url });
  return typed;
};
