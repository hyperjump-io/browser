import { parse as parseContentType } from "content-type";


const mediaTypePlugins = {};

export const addMediaTypePlugin = (contentType, plugin) => {
  mediaTypePlugins[contentType] = plugin;
};

export const removeMediaTypePlugin = (contentType) => {
  delete mediaTypePlugins[contentType];
};

export const setMediaTypeQuality = (contentType, quality) => {
  mediaTypePlugins[contentType].quality = quality;
};

export const parseResponse = (response) => {
  const contentTypeText = response.headers.get("content-type");
  if (contentTypeText === null) {
    throw new UnknownMediaTypeError("The media type of the response could not be determined. Make sure the response includes a 'Content-Type' header.", { cause: response });
  }

  const contentType = parseContentType(contentTypeText);
  for (const pattern in mediaTypePlugins) {
    if (mimeMatch(pattern, contentType.type)) {
      return mediaTypePlugins[pattern].parse(response);
    }
  }

  throw new UnsupportedMediaTypeError(contentType.type, `'${contentType.type}' is not supported. Use the 'addMediaTypePlugin' function to add support for this media type.`, {
    cause: response
  });
};

const alpha = `A-Za-z`;
const token = `[!#$%&'*\\-_.^\`|~\\d${alpha}]+`;
const mediaRange = `(?<type>${token})/(?<subType>${token}(?:\\+(?<suffix>${token}))?)`;
const mediaRangePattern = new RegExp(mediaRange);

export const mimeMatch = (expected, actual) => {
  if (expected === actual) {
    return true;
  }

  const expectedMatches = mediaRangePattern.exec(expected)?.groups;
  if (!expectedMatches) {
    throw Error(`Unable to parse media-range: ${expected}`);
  }

  const actualMatches = mediaRangePattern.exec(actual)?.groups;
  if (!actualMatches) {
    throw Error(`Unable to parse media-type: ${actual}`);
  }

  if (expectedMatches.type === actualMatches.type || expectedMatches.type === "*") {
    if (expectedMatches.subType === actualMatches.subType || expectedMatches.subType === "*") {
      return true;
    }

    if (expectedMatches.subType === actualMatches.suffix) {
      return true;
    }
  }

  return false;
};

export const getFileMediaType = async (path) => {
  for (const contentType in mediaTypePlugins) {
    if (await mediaTypePlugins[contentType].fileMatcher(path)) {
      return contentType;
    }
  }

  throw new UnknownMediaTypeError(`The media type of the file at '${path}' could not be determined. Use the 'addMediaTypePlugin' function to add support for this media type.`);
};

export const acceptableMediaTypes = () => {
  let accept = "";

  for (const contentType in mediaTypePlugins) {
    accept = addAcceptableMediaType(accept, contentType, mediaTypePlugins[contentType].quality);
  }

  return addAcceptableMediaType(accept, "*/*", "0.001");
};

const addAcceptableMediaType = (accept, contentType, quality) => {
  if (accept.length > 0) {
    accept += ", ";
  }
  accept += contentType;
  if (quality) {
    accept += `; q=${quality}`;
  }

  return accept;
};

export class UnsupportedMediaTypeError extends Error {
  constructor(mediaType, message = undefined) {
    super(message);
    this.name = this.constructor.name;
    this.mediaType = mediaType;
  }
}

export class UnknownMediaTypeError extends Error {
  constructor(message = undefined) {
    super(message);
    this.name = this.constructor.name;
  }
}
