import { toAbsoluteIri, urlToIri } from "@hyperjump/uri";

/**
 * @import { AbsoluteIri } from "@hyperjump/uri"
 */

/**
 * A file's URL as an IRI, the same as Node.js's. `new URL` leaves characters
 * a URI doesn't allow that `pathToFileURL` encodes, like `|`, and `urlToIri`
 * encodes them.
 *
 * @type (cwd: string, path: string) => AbsoluteIri
 */
export const pathToUri = (cwd, path) => {
  let directory = cwd.startsWith("/") ? cwd : `/${cwd}`;
  if (!directory.endsWith("/")) {
    directory += "/";
  }

  const base = new URL(encodePath(directory), "file:///");
  return toAbsoluteIri(urlToIri(new URL(encodePath(path), base)));
};

// Characters that Node.js's pathToFileURL encodes because the URL parser would
// otherwise treat them specially or strip them
/** @type (path: string) => string */
const encodePath = (path) => path
  .replaceAll("%", "%25")
  .replaceAll("\\", "%5C")
  .replaceAll("\n", "%0A")
  .replaceAll("\r", "%0D")
  .replaceAll("\t", "%09")
  .replaceAll("?", "%3F")
  .replaceAll("#", "%23");
