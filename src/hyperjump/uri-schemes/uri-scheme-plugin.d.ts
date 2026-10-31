import type { GetOptions } from "../hyperjump.js";

export interface UriSchemePlugin {
  schemes: string[];

  /**
   * A response without a `Content-Type` gets the media type of its URL's
   * extension (see {@link Hyperjump.getMediaType}).
   */
  retrieve(uri: string, options: RetrieveOptions): Promise<Response>;
}

/** What a request needs, which {@link Hyperjump.retrieve} gives a plugin */
export type RetrieveOptions = GetOptions & {
  /** An `Accept` header for the media types that are supported */
  accept: string;
};
