import { valuesFor } from "./url-entries.js";

/**
 * @import { UrlEntries } from "./url-entries.js"
 * @import { HeadersFunction } from "./session.d.ts"
 */

/**
 * The headers for a URL, merged from the shortest key to the longest, so a
 * longer key wins a header both have. A function is given the URL without
 * its fragment.
 *
 * @type (entries: UrlEntries<HeadersInit | HeadersFunction>, url: string) => Promise<Headers>
 */
export const headersFor = async (entries, url) => {
  const headers = new Headers();
  for (const value of valuesFor(entries, url)) {
    const target = new URL(url);
    target.hash = "";
    const init = typeof value === "function" ? await value(target) : value;
    for (const [name, headerValue] of new Headers(init)) {
      headers.set(name, headerValue);
    }
  }
  return headers;
};
