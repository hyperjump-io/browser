import type { UrlSchemePlugin } from "./url-scheme-plugin.d.ts";
import type { HyperjumpConfig } from "../hyperjump.d.ts";

/**
 * Support the `http:` and `https:` URL schemes with `fetch`. Sends the
 * request's headers, like `Accept` and the `headers` config's, except
 * `Referer`, which can be a file's URL. A response has to have a
 * `Content-Type`, because a URL's extension doesn't say what's at it, unless
 * its URL is one of the `mediaTypeByExtension` config's (see
 * {@link HyperjumpConfig}).
 *
 * A response is returned whatever its status, and the session follows a
 * redirect. A redirect can only lead to another `http:` or `https:` URL. One
 * to anything else is answered with a `502`.
 *
 * Responses are cached by the session's HTTP cache, which is configured with
 * the `httpCache` config.
 */
export class HttpUrlSchemePlugin implements UrlSchemePlugin {
  constructor();

  schemes: string[];

  retrieve(request: Request): Promise<Response>;
}
