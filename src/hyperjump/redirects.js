import { withoutFragment } from "./url-parts.js";

/**
 * @import { Layer } from "./layers.js"
 */

/**
 * Redirects are followed this many times, like `fetch` does, so a redirect
 * cycle fails instead of going on forever
 */
const maxRedirects = 20;

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

/**
 * The redirects layer. A redirect is followed with a new request down the
 * stack, so each URL it leads to goes through every layer below, like
 * `allowRetrieval`, and gets its own request headers. The new request has
 * the same headers as the one that was redirected, like its `Referer`, so
 * it's retrieved with the same options.
 *
 * The bottom of the stack gives every response a URL, so a relative
 * `Location` is resolved against it. The `Location` comes from outside, so
 * it's parsed, and one that isn't a URL throws, which fails the retrieval.
 * The fragment isn't part of what's retrieved.
 *
 * @type Layer
 */
export const redirectsLayer = (next) => async (request) => {
  let response = await next(request);
  for (let redirects = 0; ; redirects++) {
    const location = redirectStatuses.has(response.status) ? response.headers.get("location") : null;
    if (location === null) {
      return response;
    }

    await response.body?.cancel();
    if (redirects === maxRedirects) {
      throw Error(`It was redirected more than ${maxRedirects} times`);
    }

    const url = withoutFragment(new URL(location, response.url).href);
    response = await next(new Request(url, { headers: request.headers }));
  }
};
