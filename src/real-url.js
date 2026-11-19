import { realpath } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * The URL `allowRetrieval` checks. A `file:` URL is its real path, with its
 * query, so a symlink in an allowed directory can't lead outside it. A path
 * that has no real path, like a file that doesn't exist, one in a directory
 * that can't be searched, or a symlink loop, is the real path of the closest
 * directory it's in that has one, with the rest of it as it's written. What
 * doesn't exist has no symlinks in it, so a missing file is checked where it
 * would be, like an entry is. It can't be read either, and the `file:`
 * scheme says why when it's fetched.
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

  let path;
  try {
    path = fileURLToPath(url);
  } catch {
    // Not a path, like one with an encoded `/`
    return url;
  }

  /** @type string[] */
  const rest = [];
  for (;;) {
    try {
      const real = pathToFileURL(join(await realpath(path), ...rest));
      real.search = url.search;
      return real;
    } catch {
      const parent = dirname(path);
      if (parent === path) {
        return url;
      }
      rest.unshift(basename(path));
      path = parent;
    }
  }
};
