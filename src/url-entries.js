/**
 * Entries keyed by URL. A key that ends with `/` is for every URL under it,
 * and any other key is only for itself. Keys are compared as parsed URLs,
 * without their fragments.
 *
 * @template T
 * @typedef {Map<string, T>} UrlEntries
 */

/**
 * Parse entries' keys, resolving a relative one against `base`
 *
 * @type <T>(entries: Record<string, T>, base?: URL) => UrlEntries<T>
 * @throws {TypeError} If a key isn't a URL, or is relative and there's no
 * `base`.
 */
export const urlEntries = (entries, base) => {
  const parsed = new Map();
  for (const [key, value] of Object.entries(entries)) {
    parsed.set(urlKey(key, base), value);
  }
  return parsed;
};

/**
 * A key as it's compared: parsed, resolved against `base`, without its
 * fragment
 *
 * @type (key: string, base?: URL) => string
 * @throws {TypeError} If it isn't a URL, or is relative and there's no
 * `base`.
 */
export const urlKey = (key, base) => {
  if (!URL.canParse(key, base)) {
    throw new TypeError(base
      ? `'${key}' isn't a URL`
      : `'${key}' isn't an absolute URL, and there's no base URL to resolve it against`);
  }
  const url = new URL(key, base);
  url.hash = "";
  return url.href;
};

/**
 * The values of the entries that are for a URL, from the shortest key to
 * the longest
 *
 * @type <T>(entries: UrlEntries<T>, url: URL | string) => T[]
 */
export const valuesFor = (entries, url) => {
  return [...entries]
    .filter(([key]) => isFor(key, url))
    .sort(([a], [b]) => a.length - b.length)
    .map(([, value]) => value);
};

/**
 * Whether a parsed key is for a URL
 *
 * @type (key: string, url: URL | string) => boolean
 */
export const isFor = (key, url) => {
  const target = new URL(url);
  target.hash = "";
  return isPrefix(key) ? target.href.startsWith(key) : target.href === key;
};

/** A key is for everything under it when its path ends with `/` and it has no query */
const isPrefix = (/** @type string */ key) => key.endsWith("/") && !key.includes("?");
