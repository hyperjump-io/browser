import type { GetOptions } from "../hyperjump.js";

export interface UriSchemePlugin {
  schemes: string[];

  /**
   * A response without a `Content-Type` can't be parsed. A response without a
   * URL gets the URI that was retrieved.
   *
   * A redirect (301, 302, 303, 307, or 308 with a `Location`, such as from
   * `Response.redirect`) is followed by the session. Where it leads is
   * checked against `allowRetrieval` before it's retrieved, with the plugin
   * for its scheme and the same options. A relative `Location` is resolved
   * against the response's URL. A plugin for a scheme that maps to another
   * URI, like `urn:`, redirects to it.
   */
  retrieve(uri: string, options: RetrieveOptions): Promise<Response>;
}

/** What a request needs, which the `Hyperjump` gives a plugin */
export type RetrieveOptions = GetOptions & {
  /** An `Accept` header for the media types that are supported */
  accept: string;

  /**
   * The media type of a URL's extension, the longest one a media type plugin
   * has, for a scheme whose responses don't have a `Content-Type`, like
   * `file:`, or a server known to send the wrong one
   */
  mediaTypeByExtension: (uri: string) => string | undefined;
};
