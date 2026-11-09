import { UnsupportedUrlSchemeError } from "../hyperjump.js";
import { withoutFragment } from "../url-parts.js";

/**
 * @import { Fetch } from "../layers.js"
 * @import { UrlSchemePlugin } from "./url-scheme-plugin.d.ts"
 */

/**
 * The bottom of the stack: the URL scheme plugin for the request's scheme.
 * A plugin is a `Fetch` for its scheme. Its response's URL comes from outside, so it's parsed,
 * without its fragment, which isn't part of what's retrieved. A response
 * without a URL gets the request's, so a redirect's `Location` can be
 * relative to it.
 *
 * @type (plugins: ReadonlyMap<string, UrlSchemePlugin>) => Fetch
 */
export const urlSchemesFetch = (plugins) => async (request) => {
  // An `href`'s scheme is lowercase
  const scheme = request.url.slice(0, request.url.indexOf(":"));
  const plugin = plugins.get(scheme);
  if (!plugin) {
    throw new UnsupportedUrlSchemeError(scheme, `The '${scheme}:' URL scheme is not supported. Use the 'urlSchemePlugins' config to add support for '${scheme}:' URLs.`);
  }

  const response = await plugin.retrieve(request);

  const url = response.url ? withoutFragment(new URL(response.url).href) : request.url;
  if (url === response.url) {
    return response;
  }

  // A plugin can have defined its response's URL, which can't be redefined,
  // so the URL goes on a new response with the same status, headers, and
  // body
  const located = new Response(response.body, response);
  Object.defineProperty(located, "url", { value: url });
  return located;
};
