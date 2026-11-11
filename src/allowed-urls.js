import { realUrl } from "#real-url";
import { isFor, urlKey } from "./url-entries.js";
import { networkError } from "./response-meta.js";

/**
 * Resolve a session's `allowRetrieval` against its base. Without a list,
 * it's the runtime's default (`defaults`). The default is relative, so where
 * there's no base, such as in a worker, it's the error a
 * check throws, so a session that never fetches doesn't need a list.
 *
 * @type (entries: string[] | undefined, base: URL | undefined, defaults: string[]) => string[] | TypeError
 * @throws {TypeError} If an entry isn't a URL, or is relative and there's no
 * base.
 */
export const resolveAllowRetrieval = (entries, base, defaults) => {
  if (entries !== undefined) {
    return entries.map((entry) => urlKey(entry, base));
  }
  if (base === undefined) {
    return new TypeError(`The default 'allowRetrieval' is '${defaults.join("', '")}', which is relative, and there's no base URL to resolve it against here. Give the session an 'allowRetrieval' of absolute URLs.`);
  }
  return defaults.map((entry) => urlKey(entry, base));
};

/**
 * Entries as they're compared: a `file:` entry by its real path, like the
 * URLs checked against it. A real path doesn't end with `/`, so a
 * directory's entry gets it back.
 *
 * @type (entries: string[]) => Promise<string[]>
 */
export const realEntries = (entries) => Promise.all(entries.map(async (entry) => {
  const { href } = await realUrl(new URL(entry));
  return entry.endsWith("/") && !href.endsWith("/") ? `${href}/` : href;
}));

/**
 * Whether real entries allow a URL. A `file:` URL is compared by its real
 * path. A `data:` URL is its content, so it's always allowed: nothing is
 * fetched, and a path can't be a prefix of it.
 *
 * @type (entries: string[], url: string) => Promise<boolean>
 */
export const allows = async (entries, url) => {
  const target = new URL(url);
  if (target.protocol === "data:") {
    return true;
  }
  target.hash = "";
  const { href } = await realUrl(target);
  return entries.some((entry) => isFor(entry, href));
};

/** @type (url: string) => TypeError */
export const refused = (url) => networkError(`Fetching '${url}' isn't allowed. Add it to the session's 'allowRetrieval' to allow it.`);

/** @type (url: string, responseUrl: string) => TypeError */
export const refusedResponse = (url, responseUrl) => networkError(`Fetching '${url}' led to '${responseUrl}', which isn't allowed. Add it to the session's 'allowRetrieval' to allow it.`);
