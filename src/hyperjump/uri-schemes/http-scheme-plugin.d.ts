import type { GetOptions, Hyperjump } from "../hyperjump.js";
import type { UriSchemePlugin } from "./uri-scheme-plugin.d.ts";

/**
 * Support the `http:` and `https:` URI schemes. Sends an Accept header
 * representing all registered media types.
 */
export class HttpUriSchemePlugin implements UriSchemePlugin {
  constructor(hyperjump: Hyperjump<any>);

  schemes: string[];

  /**
   * @throws {@link HttpError}
   */
  retrieve(uri: string, options: GetOptions): Promise<Response>;
}

/**
 * Thrown when an HTTP request returns an error or an unsupported status code.
 */
export class HttpError extends Error {
  response: Response;

  constructor(response: Response, message?: string);
}
