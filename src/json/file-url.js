import { pathToUrl } from "#path-to-url";
import { parseDocumentUrl } from "../hyperjump/url-parts.js";

/**
 * @import { VFile } from "vfile"
 */

/**
 * The URL of a file's document: its `path`, resolved against its `cwd`, or
 * the `url` option for a file without one, like text from stdin. A file
 * with neither has no URL, so the parse fails. One with both fails too,
 * because they'd be two places to say where the document is, which could
 * disagree.
 *
 * @type (file: VFile, url: string | undefined) => string
 */
export const fileUrl = (file, url) => {
  if (file.path) {
    if (url !== undefined) {
      return file.fail("A file with a path has its own URL, so it can't have a 'url' option too");
    }
    return pathToUrl(file.cwd, file.path);
  }

  if (url === undefined) {
    return file.fail("A file needs a path or a 'url' option, which is its document's URL");
  }

  try {
    return parseDocumentUrl(url);
  } catch {
    return file.fail(`The 'url' option, '${url}', isn't a URL without a fragment`);
  }
};
