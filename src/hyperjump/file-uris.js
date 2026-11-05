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

  // Parsing it normalizes it, so a scheme written as 'FILE:' is relative too
  const url = new URL(uri);
  const suffix = url.search + url.hash;

  // There are no files to be relative to where the working directory isn't
  // a folder, like in a browser
  const base = contextUri();
  if (!/^file:/i.test(base)) {
    return url.pathname.slice(url.pathname.lastIndexOf("/") + 1) + suffix;
  }

  // The working directory's URL ends with a `/`, so its last segment is empty
  const directories = new URL(base).pathname.split("/").slice(0, -1);
  const segments = url.pathname.split("/");
  let common = 0;
  while (common < directories.length && common < segments.length - 1 && directories[common] === segments[common]) {
    common++;
  }

  return "../".repeat(directories.length - common) + segments.slice(common).join("/") + suffix;
};
