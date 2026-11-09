/**
 * A list of URLs in an option or config, like `headers` or
 * `mediaTypeByExtension`, works like `allowRetrieval`: an entry that ends
 * with `/` is for everything under it, and any other is only for itself.
 */

/**
 * An entry is compared after it's parsed, and its fragment is ignored. One
 * that isn't an absolute URL throws, because there's nothing to resolve it
 * against. The error says where it came from (`source`).
 *
 * @type (entry: string, source: string) => string
 */
export const resolveUrlEntry = (entry, source) => {
  let url;
  try {
    url = new URL(entry);
  } catch {
    throw Error(`'${entry}' in the ${source} isn't an absolute URL`);
  }

  url.hash = "";
  return url.href;
};

/** @type (entry: string, href: string) => boolean */
export const matchesUrlEntry = (entry, href) => entry.endsWith("/") ? href.startsWith(entry) : href === entry;
