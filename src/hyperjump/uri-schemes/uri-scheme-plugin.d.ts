import type { GetOptions } from "../hyperjump.js";

export interface UriSchemePlugin {
  schemes: string[];

  /**
   * A response without a `Content-Type` gets the media type of its URL's
   * extension, according to the media type plugins.
   */
  retrieve(uri: string, options: RetrieveOptions): Promise<Response>;
}

/** What a request needs, which the `Hyperjump` gives a plugin */
export type RetrieveOptions = GetOptions & {
  /** An `Accept` header for the media types that are supported */
  accept: string;

  /**
   * Retrieve another URI with the plugin for its scheme, the way the
   * `Hyperjump` retrieved this one, for a scheme that maps to another URI,
   * like `urn:`. It isn't checked against `allowRetrieval`, but the response
   * is checked by the URL it came from, so that URL has to be allowed.
   */
  retrieve: (uri: string, options?: GetOptions) => Promise<Response>;
};
