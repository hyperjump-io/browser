import { resolveIri, parseIriReference } from "@hyperjump/uri";
import { acceptableMediaTypes } from "../media-types/media-types.js";


const redirectStatus = new Set([301, 302, 303, 307, 308]);
const successStatus = new Set([200, 203]);

const retrieve = async (uri) => {
  const { fragment } = parseIriReference(uri);

  const response = await fetch(uri, { headers: { Accept: acceptableMediaTypes() }, redirect: "manual" });

  if (redirectStatus.has(response.status) && response.headers.has("location")) {
    const location = response.headers.get("location");
    let redirectUri = resolveIri(location, uri);
    if (redirectUri.indexOf("#") === -1 && fragment) {
      redirectUri += "#" + fragment;
    }

    return retrieve(redirectUri);
  }

  if (response.status >= 400) {
    throw new HttpError(response, `Failed to retrieve '${uri}'`);
  }

  if (!successStatus.has(response.status)) {
    throw new HttpError(response, "Unsupported HTTP response status code");
  }

  return { response, fragment: fragment ?? "" };
};

export const httpSchemePlugin = { retrieve };

export class HttpError extends Error {
  constructor(response, message = undefined) {
    super(`${response.status} ${response.statusText}${message ? ` -- ${message}` : ""}`);
    this.name = this.constructor.name;
    this.response = response;
  }
}
