import { realUrl } from "#real-url";
import { isPrefix, urlKey } from "./url-entries.js";
import { networkError } from "./response-meta.js";
import { relativeFileUrl } from "./file-urls.js";

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
 * Entries as they're compared. The ones that allow only themselves are a
 * set, so a long list of them costs a check nothing.
 *
 * @typedef {{ exact: Set<string>, prefixes: string[] }} RealEntries
 */

/**
 * Entries as they're compared: a `file:` entry by its real path, like the
 * URLs checked against it. A real path doesn't end with `/`, so a
 * directory's entry gets it back.
 *
 * @type (entries: string[]) => Promise<RealEntries>
 */
export const realEntries = async (entries) => {
  const real = await Promise.all(entries.map(async (entry) => {
    const { href } = await realUrl(new URL(entry));
    return entry.endsWith("/") && !href.endsWith("/") ? `${href}/` : href;
  }));
  return {
    exact: new Set(real.filter((entry) => !isPrefix(entry))),
    prefixes: real.filter(isPrefix)
  };
};

/**
 * Whether real entries allow a URL. A `file:` URL is compared by its real
 * path. A `data:` URL is its content, so it's always allowed: nothing is
 * fetched, and a path can't be a prefix of it.
 *
 * @type (entries: RealEntries, url: string) => Promise<boolean>
 */
export const allows = async ({ exact, prefixes }, url) => {
  const target = new URL(url);
  if (target.protocol === "data:") {
    return true;
  }
  target.hash = "";
  const { href } = await realUrl(target);
  return exact.has(href) || prefixes.some((prefix) => href.startsWith(prefix));
};

/** @type (url: string) => TypeError */
export const refused = (url) => networkError(`Fetching '${relativeFileUrl(url)}' isn't allowed. Add it to the session's 'allowRetrieval' to allow it.`, { code: "ERR_RETRIEVAL_NOT_ALLOWED" }, url);

/** @type (url: string, responseUrl: string) => TypeError */
export const refusedResponse = (url, responseUrl) => networkError(`Fetching '${relativeFileUrl(url)}' led to '${relativeFileUrl(responseUrl)}', which isn't allowed. Add it to the session's 'allowRetrieval' to allow it.`, { code: "ERR_RETRIEVAL_NOT_ALLOWED" }, responseUrl);
