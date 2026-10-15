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

/** @type (cwd: string, path: string) => string */
export const pathToUri = (cwd, path) => {
  let directory = cwd.startsWith("/") ? cwd : `/${cwd}`;
  if (!directory.endsWith("/")) {
    directory += "/";
  }

  const base = new URL(encodePath(directory), "file:///");
  return new URL(encodePath(path), base).href;
};
