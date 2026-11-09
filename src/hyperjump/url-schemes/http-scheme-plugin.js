import { redirectMode } from "#redirect-mode";
import { problemResponse } from "../problem-details.js";

/**
 * @import * as API from "./http-scheme-plugin.d.ts"
 */

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

/** @implements API.HttpUrlSchemePlugin */
export class HttpUrlSchemePlugin {
  constructor() {
    this.schemes = ["http", "https"];
  }

  /** @type API.HttpUrlSchemePlugin["retrieve"] */
  async retrieve(request) {
    // A request's `Referer` can be a file's URL, which a server shouldn't
    // see, so it isn't sent
    const headers = new Headers(request.headers);
    headers.delete("referer");
    const response = await fetch(request.url, { headers, redirect: redirectMode });

    // A redirect can only lead to another `http(s):` URL, like a redirect
    // `fetch` follows, so a server can't send the session to a file
    const location = redirectStatuses.has(response.status) ? response.headers.get("location") : null;
    if (location !== null && !isHttpUrl(location, response.url || request.url)) {
      await response.body?.cancel();
      return problemResponse(request.url, 502, "Bad Gateway", `A redirect to '${location}', which isn't an 'http:' or 'https:' URL`);
    }

    return response;
  }
}

/** @type (location: string, base: string) => boolean */
const isHttpUrl = (location, base) => {
  const url = URL.parse(location, base);
  return url?.protocol === "http:" || url?.protocol === "https:";
};
