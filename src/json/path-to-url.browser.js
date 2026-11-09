/**
 * A file's URL, the same as Node.js's. `pathToFileURL` encodes characters
 * that `new URL` leaves, like `|`, so they're encoded first.
 *
 * @type (cwd: string, path: string) => string
 */
export const pathToUrl = (cwd, path) => {
  let directory = cwd.startsWith("/") ? cwd : `/${cwd}`;
  if (!directory.endsWith("/")) {
    directory += "/";
  }

  const base = new URL(encodePath(directory), "file:///");
  return new URL(encodePath(path), base).href;
};

// Characters that Node.js's pathToFileURL encodes, because the URL parser
// would otherwise treat them specially or strip them, or leave them as they
// are
/** @type (path: string) => string */
const encodePath = (path) => path
  .replaceAll("%", "%25")
  .replaceAll("\\", "%5C")
  .replaceAll("\n", "%0A")
  .replaceAll("\r", "%0D")
  .replaceAll("\t", "%09")
  .replaceAll("?", "%3F")
  .replaceAll("#", "%23")
  .replaceAll("|", "%7C")
  .replaceAll("^", "%5E")
  .replaceAll("[", "%5B")
  .replaceAll("]", "%5D");
