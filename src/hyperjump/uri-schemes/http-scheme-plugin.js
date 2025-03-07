/**
 * @import { Hyperjump } from "../index.js"
 * @import { UriSchemePlugin } from "./uri-scheme-plugin.js"
 * @import * as API from "./http-scheme-plugin.d.ts"
 */


/** @implements API.HttpUriSchemePlugin */
export class HttpUriSchemePlugin {
  #hyperjump;
  #successStatus;

  /**
   * @param {Hyperjump} hyperjump
   */
  constructor(hyperjump) {
    this.schemes = ["http", "https"];

    this.#hyperjump = hyperjump;
    this.#successStatus = new Set([200, 203]);
  }

  /** @type API.HttpUriSchemePlugin["retrieve"] */
  async retrieve(uri) {
    const response = await fetch(uri, {
      headers: { Accept: this.#hyperjump.acceptableMediaTypes() }
    });

    if (response.status >= 400) {
      throw new HttpError(response, `Failed to retrieve '${uri}'`);
    }

    if (!this.#successStatus.has(response.status)) {
      throw new HttpError(response, "Unsupported HTTP response status code");
    }

    return response;
  };
}

class HttpError extends Error {
  /**
   * @param {Response} response
   * @param {string} [message]
   */
  constructor(response, message = undefined) {
    super(`${response.status} ${response.statusText}${message ? ` -- ${message}` : ""}`);
    this.name = this.constructor.name;
    this.response = response;
  }
}
