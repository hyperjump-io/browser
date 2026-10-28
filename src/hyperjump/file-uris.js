import { parseIri, resolveIri, toRelativeIri } from "@hyperjump/uri";
import { contextUri } from "#context-uri";

/**
 * @import * as API from "./file-uris.d.ts"
 */

/** @type API.relativeFileUri */
export const relativeFileUri = (uri) => {
  // It can be anything else, like a location that's only a fragment
  if (!/^file:/i.test(uri)) {
    return uri;
  }

  // There are no files to be relative to where the working directory isn't
  // a folder, like in a browser
  const base = contextUri();
  if (!/^file:/i.test(base)) {
    const { path, fragment } = parseIri(uri);
    const name = path.slice(path.lastIndexOf("/") + 1);
    return fragment === undefined ? name : `${name}#${fragment}`;
  }

  // Resolving it normalizes it, so a scheme written as 'FILE:' is relative too
  return toRelativeIri(base, resolveIri(uri, base));
};
