import { getScheme, hasScheme, normalizeIri, parseIri, toRelativeIri } from "@hyperjump/uri";
import { contextUri } from "#context-uri";

/**
 * @import { Iri, IriReference } from "@hyperjump/uri"
 * @import * as API from "./file-uris.d.ts"
 */

/** @type typeof API.relativeFileUri */
export const relativeFileUri = (uri) => {
  // It can be anything else, like a location that's only a fragment
  if (!isFileIri(uri)) {
    return uri;
  }

  // There are no files to be relative to where the working directory isn't
  // a folder, like in a browser
  const base = contextUri();
  if (base === undefined || !isFileIri(base)) {
    const { path, fragment } = parseIri(uri);
    const name = path.slice(path.lastIndexOf("/") + 1);
    return fragment === undefined ? name : `${name}#${fragment}`;
  }

  // Normalized, so a scheme written as 'FILE:' is relative too
  return toRelativeIri(normalizeIri(uri), normalizeIri(base));
};

/**
 * A scheme is case-insensitive
 *
 * @template {IriReference} T
 * @param {T} uri
 * @returns {uri is T & Iri}
 */
const isFileIri = (uri) => hasScheme(uri) && getScheme(uri).toLowerCase() === "file";
