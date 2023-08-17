import { get as pointerGet } from "@hyperjump/json-pointer";
import { resolveIri } from "@hyperjump/uri";
import { parseResponse, acceptableMediaTypes } from "./media-types.js";
import { Reference } from "./jref/index.js";


const redirectStatus = new Set([301, 302, 303, 307, 308]);
const successStatus = new Set([200, 203]);

export const get = async (uri) => {
  const response = await fetch(uri, { headers: { Accept: acceptableMediaTypes() }, redirect: "manual" });

  if (redirectStatus.has(response.status) && response.headers.has("location")) {
    const location = response.headers.get("location");
    let redirectUri = resolveIri(location, uri);
    const fragment = uriFragment(uri);
    if (redirectUri.indexOf("#") === -1 && fragment) {
      redirectUri += "#" + fragment;
    }

    return get(redirectUri);
  }

  if (response.status >= 400) {
    throw new HttpError(response, `Failed to retrieve '${uri}'`);
  }

  if (!successStatus.has(response.status)) {
    throw new HttpError(response, "Unsupported HTTP response status code");
  }

  const pointer = uriFragment(uri);
  const document = await parseResponse(response);

  const browser = {
    uri: uri,
    cursor: pointer,
    document: document,
    _value: pointerGet(pointer, document.value)
  };

  if (browser._value instanceof Reference) {
    const referenceUri = resolveIri(browser._value.href, response.url);
    return get(referenceUri);
  }

  return browser;
};

export const value = (browser) => browser._value;

export class HttpError extends Error {
  constructor(response, message = undefined) {
    super(`${response.status} ${response.statusText}${message ? ` -- ${message}` : ""}`);
    this.name = this.constructor.name;
    this.response = response;
  }
}

const uriFragment = (uri) => {
  const position = uri.indexOf("#");
  return position === -1 ? "" : uri.slice(position + 1);
};
