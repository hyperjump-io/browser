import { isTypeValid, parse as parseContentType } from "content-type";
import { mimeMatchSpecificity } from "./utilities.js";
import { relativeFileUri } from "./file-uris.js";
import { UnsupportedMediaTypeError } from "./hyperjump.js";

/**
 * What a `Hyperjump` works out from its media type plugins. They're
 * functions of the plugins, keyed by media type in the order they were
 * configured, so they're tested without retrieving anything. They aren't
 * exported from the package.
 *
 * @import { AbsoluteIri } from "@hyperjump/uri"
 * @import { DocumentNode, MediaTypePlugin } from "./media-types/media-type-plugin.d.ts"
 * @typedef {ReadonlyMap<string, MediaTypePlugin<DocumentNode>>} MediaTypePlugins
 */

/**
 * Every media type plugin with its quality, and any media type last. A
 * quality is a number from 0 to 1 with at most three decimal places (RFC
 * 9110, section 12.4.2), or it throws.
 *
 * @type (mediaTypePlugins: MediaTypePlugins) => string
 */
export const acceptHeader = (mediaTypePlugins) => {
  const mediaTypes = [];
  for (const [mediaType, { quality }] of mediaTypePlugins) {
    if (quality === undefined) {
      mediaTypes.push(mediaType);
    } else if (isQuality(quality)) {
      mediaTypes.push(`${mediaType}; q=${quality}`);
    } else {
      throw RangeError(`The quality of the '${mediaType}' media type plugin is ${String(quality)}. It must be a number from 0 to 1 with at most three decimal places.`);
    }
  }
  mediaTypes.push("*/*; q=0.001");

  return mediaTypes.join(", ");
};

/**
 * The media type of a URL's extension, if a media type plugin has it. The
 * plugin with the longest matching extension wins, so `.schema.json` takes
 * precedence over `.json`. If there's a tie, the plugin that comes first
 * wins.
 *
 * @type (mediaTypePlugins: MediaTypePlugins, uri: string) => string | undefined
 */
export const mediaTypeByExtension = (mediaTypePlugins, uri) => {
  let bestContentType;
  let bestLength = 0;
  for (const [contentType, plugin] of mediaTypePlugins) {
    for (const extension of plugin.extensions) {
      if (extension.length > bestLength && uri.endsWith(extension)) {
        if (extension.startsWith("/") || (extension.startsWith(".") && uri[uri.length - extension.length - 1] !== "/")) {
          bestContentType = contentType;
          bestLength = extension.length;
        }
      }
    }
  }

  return bestContentType;
};

/**
 * The media type plugin with the most specific match for a `Content-Type`,
 * and the media type it's keyed by. If there's a tie, the plugin that comes
 * first wins. `url` is where the response came from, for the error.
 *
 * @type (mediaTypePlugins: MediaTypePlugins, contentTypeText: string | null, url: AbsoluteIri) => [string, MediaTypePlugin<DocumentNode>]
 */
export const mediaTypePluginFor = (mediaTypePlugins, contentTypeText, url) => {
  if (contentTypeText === null) {
    throw new UnsupportedMediaTypeError(undefined, `The media type of '${relativeFileUri(url)}' could not be determined. A response needs a 'Content-Type' header, and a file needs an extension that a media type plugin has. Use the 'mediaTypePlugins' config to add support for a media type.`);
  }

  // The parser is lenient, so the type needs to be validated
  const contentType = parseContentType(contentTypeText);
  if (!isTypeValid(contentType.type)) {
    throw new UnsupportedMediaTypeError(undefined, `The media type of the response could not be determined. The 'Content-Type' header isn't valid: '${contentTypeText}'`);
  }

  /** @type [string, MediaTypePlugin<DocumentNode>] | undefined */
  let best;
  let bestSpecificity = 0;
  for (const [pattern, plugin] of mediaTypePlugins) {
    const specificity = mimeMatchSpecificity(pattern, contentType.type);
    if (specificity > bestSpecificity) {
      best = [pattern, plugin];
      bestSpecificity = specificity;
    }
  }

  if (!best) {
    throw new UnsupportedMediaTypeError(contentType.type, `'${contentType.type}' is not supported. Use the 'mediaTypePlugins' config to add support for this media type.`);
  }

  return best;
};

/**
 * The JSON Pointer a fragment identifies in a document, according to the
 * plugin for the document's media type. A media type that doesn't define
 * fragments identifies the whole document.
 *
 * @type (mediaTypePlugins: MediaTypePlugins, document: DocumentNode, fragment: string) => string
 */
export const fragmentPointer = (mediaTypePlugins, document, fragment) => {
  if (document.mediaType === undefined) {
    return "";
  }

  return mediaTypePlugins.get(document.mediaType)?.fragmentPointer?.(document, fragment) ?? "";
};

/** @type (quality: unknown) => boolean */
const isQuality = (quality) => typeof quality === "number"
  && quality >= 0 && quality <= 1
  && Math.round(quality * 1000) / 1000 === quality;
