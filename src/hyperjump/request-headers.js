import { matchesUrlEntry, resolveUrlEntry } from "./url-entries.js";

/**
 * @import { Layer } from "./layers.js"
 * @import { HeadersFunction } from "./hyperjump.d.ts"
 */

/** @typedef {[string, HeadersInit | HeadersFunction][]} RequestHeaders */

/**
 * Check the `headers` config's URLs and sort its entries from the shortest
 * URL to the longest, so a longer one's headers win when they're merged
 *
 * @type (headers: Record<string, HeadersInit | HeadersFunction>) => RequestHeaders
 */
export const resolveRequestHeaders = (headers) => {
  return Object.entries(headers)
    .map(([entry, value]) => /** @type RequestHeaders[number] */ ([resolveUrlEntry(entry, "'headers' config"), value]))
    .sort(([a], [b]) => a.length - b.length);
};

/**
 * The request headers layer. A request gets the headers configured for its
 * URL. Documents aren't trusted and can name any URL, so only the URLs
 * listed get headers. A redirect is a new request, so it gets the headers
 * for its own URL.
 *
 * A `HeadersFunction` is called with the requested URL, which doesn't have
 * a fragment. It's a copy for each function, so one that changes it doesn't
 * change what the next one sees.
 *
 * @type (entries: RequestHeaders) => Layer
 */
export const requestHeadersLayer = (entries) => (next) => async (request) => {
  const matching = entries.filter(([entry]) => matchesUrlEntry(entry, request.url));
  if (matching.length === 0) {
    return next(request);
  }

  const headers = new Headers(request.headers);
  for (const [, value] of matching) {
    const entryHeaders = new Headers(typeof value === "function" ? await value(new URL(request.url)) : value);
    for (const [name, headerValue] of entryHeaders) {
      headers.set(name, headerValue);
    }
  }

  return next(new Request(request.url, { headers }));
};
