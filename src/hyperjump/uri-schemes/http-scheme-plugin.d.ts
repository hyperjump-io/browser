import { Hyperjump } from "../hyperjump.js";
import { UriSchemePlugin } from "./uri-scheme-plugin.d.ts";


/**
 * Support the `http:` and `https:` URI schemes. Sends an Accept header
 * representng all registered media types.
 */
export class HttpUriSchemePlugin implements UriSchemePlugin {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(hyperjump: Hyperjump<any>);

  schemes: string[];

  /**
   * @throws {@link HttpError}
   */
  retrieve: UriSchemePlugin["retrieve"];
}

class HttpError extends Error {
  constructor(response: Response, message?: string);
}
