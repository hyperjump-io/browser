import { parseResponse, acceptableMediaTypes } from "./media-types.js";


export const get = async (uri) => {
  const response = await fetch(uri, { headers: { Accept: acceptableMediaTypes() } });
  if (response.status >= 400) {
    throw new HttpError(response, `Failed to retrieve '${uri}'`);
  }

  return {
    uri: uri,
    document: await parseResponse(response)
  };
};

export class HttpError extends Error {
  constructor(response, message = undefined) {
    super(`${response.status} ${response.statusText}${message ? ` -- ${message}` : ""}`);
    this.name = this.constructor.name;
    this.response = response;
  }
}
