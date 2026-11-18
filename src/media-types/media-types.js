import { jrefMediaType } from "./jref-media-type.js";
import { jsonMediaType } from "./json-media-type.js";

/**
 * @import * as API from "./media-types.d.ts"
 */

/** @type typeof API.defaultMediaTypes */
export const defaultMediaTypes = Object.freeze([jrefMediaType, jsonMediaType]);

/** @type typeof API.acceptHeader */
export const acceptHeader = (mediaTypes) => {
  const accepted = mediaTypes.map(({ mediaType, quality }) => {
    if (quality === undefined) {
      return mediaType;
    }
    if (!isQuality(quality)) {
      throw RangeError(`The quality of the '${mediaType}' media type is ${String(quality)}. It must be a number from 0 to 1 with at most three decimal places.`);
    }
    return `${mediaType}; q=${quality}`;
  });
  return [...accepted, "*/*; q=0.001"].join(", ");
};

/** @type typeof API.mediaTypeForContentType */
export const mediaTypeForContentType = (mediaTypes, contentType) => {
  const actual = extractMediaType(contentType);
  if (!actual) {
    return undefined;
  }

  let best;
  let bestSpecificity = 0;
  for (const plugin of mediaTypes) {
    const specificity = matchSpecificity(plugin.mediaType, actual);
    if (specificity > bestSpecificity) {
      best = plugin;
      bestSpecificity = specificity;
    }
  }
  return best;
};

/** @type typeof API.mediaTypeForExtension */
export const mediaTypeForExtension = (mediaTypes, url) => {
  // An extension's case doesn't matter, as it doesn't to a web server
  const path = new URL(url).pathname.toLowerCase();

  let best;
  let bestLength = 0;
  for (const plugin of mediaTypes) {
    for (const extension of plugin.extensions) {
      if (extension.length > bestLength && path.endsWith(extension.toLowerCase()) && isNameEnd(path, extension)) {
        best = plugin;
        bestLength = extension.length;
      }
    }
  }
  return best;
};

/**
 * A file name starts with `/`, which is where a name starts. An extension
 * has to come after something in the name, so `/.json` isn't a `.json` file.
 *
 * @type (path: string, extension: string) => boolean
 */
const isNameEnd = (path, extension) => extension.startsWith("/")
  || (extension.startsWith(".") && path[path.length - extension.length - 1] !== "/");

/**
 * The media type of a `Content-Type`, by the Fetch standard's "extract a
 * MIME type": a header that's several values, like two headers combined, is
 * the last one that's a media type and isn't a range.
 *
 * @type (contentType: string | null) => MediaType | undefined
 */
const extractMediaType = (contentType) => {
  let found;
  for (const value of splitHeader(contentType ?? "")) {
    const parsed = parseMediaType(value.split(";", 1)[0]);
    if (parsed && parsed.type !== "*" && parsed.subtype !== "*") {
      found = parsed;
    }
  }
  return found;
};

/**
 * A header's values, by the Fetch standard's "get, decode, and split": a
 * comma separates them, except in a quoted string, where `\` escapes the
 * next character
 *
 * @type (header: string) => string[]
 */
const splitHeader = (header) => {
  const values = [];
  let value = "";
  let quoted = false;
  for (let position = 0; position < header.length; position++) {
    const char = header[position];
    if (quoted && char === "\\") {
      value += header.slice(position, position + 2);
      position++;
    } else if (char === "\"") {
      quoted = !quoted;
      value += char;
    } else if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value.trim());
  return values;
};

const token = "[!#$%&'*+\\-.^_`|~0-9A-Za-z]+";
const mediaTypePattern = new RegExp(`^(${token})/(${token})$`);

/**
 * @typedef {{ type: string, subtype: string, suffix: string | undefined }} MediaType
 */

/**
 * A media type or range without parameters (RFC 9110, section 8.3.1), in
 * lowercase, since types are case-insensitive. A structured suffix is what
 * follows the last `+` of the subtype (RFC 6838, section 4.2.8).
 *
 * @type (text: string | undefined) => MediaType | undefined
 */
const parseMediaType = (text) => {
  const match = mediaTypePattern.exec(text?.trim().toLowerCase() ?? "");
  if (!match) {
    return undefined;
  }
  const [, type, subtype] = match;
  const plus = subtype.lastIndexOf("+");
  return { type, subtype, suffix: plus === -1 ? undefined : subtype.slice(plus + 1) };
};

/**
 * How specifically a plugin's media type matches a response's: 0 if it
 * doesn't, and higher for a closer match. The subtype counts for more than
 * the type: the same subtype, then the response's structured suffix, then
 * any subtype.
 *
 * @type (expected: string, actual: MediaType) => number
 */
const matchSpecificity = (expected, actual) => {
  const range = parseMediaType(expected);
  if (!range) {
    throw TypeError(`'${expected}' isn't a media type`);
  }

  let typeSpecificity;
  if (range.type === actual.type) {
    typeSpecificity = 1;
  } else if (range.type === "*") {
    typeSpecificity = 0;
  } else {
    return 0;
  }

  let subtypeSpecificity;
  if (range.subtype === actual.subtype) {
    subtypeSpecificity = 3;
  } else if (range.subtype === actual.suffix) {
    subtypeSpecificity = 2;
  } else if (range.subtype === "*") {
    subtypeSpecificity = 1;
  } else {
    return 0;
  }

  return subtypeSpecificity * 2 + typeSpecificity;
};

/** @type (quality: unknown) => boolean */
const isQuality = (quality) => typeof quality === "number"
  && quality >= 0 && quality <= 1
  && Math.round(quality * 1000) / 1000 === quality;
