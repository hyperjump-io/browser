import type { GetOptions } from "../hyperjump.js";

export interface UriSchemePlugin {
  schemes: string[];

  /**
   * A response without a `Content-Type` can't be parsed. A response without a
   * URL gets the URI that was retrieved.
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
   * `file:`
   */
  mediaTypeByExtension: (uri: string) => string | undefined;

  /**
   * Retrieve another URI with the plugin for its scheme, the way the
   * `Hyperjump` retrieved this one, for a scheme that maps to another URI,
   * like `urn:`. It isn't checked against `allowRetrieval`, but the response
   * is checked by the URL it came from, so that URL has to be allowed.
   */
  retrieve: (uri: string, options?: GetOptions) => Promise<Response>;
};
