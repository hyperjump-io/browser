import type { Fetch } from "../layers.js";

export interface UrlSchemePlugin {
  schemes: string[];

  /**
   * A `Fetch` for the plugin's schemes, at the bottom of the session's
   * stack. The request's URL is an `href` without its fragment. It has the
   * `Accept` header for the media types that are supported, and a request
   * for a reference has a `Referer`: the URL of the document the reference
   * is in.
   *
   * A response without a `Content-Type` can't be parsed, unless it's a
   * `file:` response or its URL is one of the `mediaTypeByExtension`
   * config's, which get the media type of their extension. A response
   * without a URL gets the request's.
   *
   * A redirect (301, 302, 303, 307, or 308 with a `Location`, such as from
   * `Response.redirect`) is followed by the session. Where it leads is
   * checked against `allowRetrieval` before it's retrieved, with the plugin
   * for its scheme and the same headers. A relative `Location` is resolved
   * against the response's URL. A plugin for a scheme that maps to another
   * URL, like `urn:`, redirects to it.
   */
  retrieve: Fetch;
}
