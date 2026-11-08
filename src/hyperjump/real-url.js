import { realpath } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * The URL `allowRetrieval` checks. A `file:` URL is replaced with its real
 * path, so a symlink in an allowed directory can't lead outside it. A file
 * that doesn't exist has no real path, so its path is checked as it is.
 *
 * A `file:` URL with a host is checked as it is too. On Windows its path is a
 * UNC path, and finding its real path would connect to that host, with the
 * user's credentials, before the URL is refused. A URL's parser makes
 * `localhost` an empty host.
 *
 * @type (url: URL) => Promise<URL>
 */
export const realUrl = async (url) => {
  if (url.protocol !== "file:" || url.host !== "") {
    return url;
  }

  try {
    return pathToFileURL(await realpath(fileURLToPath(url)));
  } catch (error) {
    const code = /** @type {{ code?: unknown }} */ (error).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return url;
    }
    throw error;
  }
};
