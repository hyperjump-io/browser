import { realpath } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * The URL `allowRetrieval` checks. A `file:` URL is its real path, with its
 * query, so a symlink in an allowed directory can't lead outside it. A path
 * that has no real path, like a file that doesn't exist, one in a directory
 * that can't be searched, or a symlink loop, is checked as it is. It can't
 * be read either, and the `file:` scheme says why when it's fetched.
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

  let real;
  try {
    real = pathToFileURL(await realpath(fileURLToPath(url)));
  } catch {
    return url;
  }
  real.search = url.search;
  return real;
};
