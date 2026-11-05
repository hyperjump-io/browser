/**
 * Resolve a URL against the context URI. Where there's no context URI, as
 * in a browser without a document, only an absolute URL can be resolved.
 *
 * @type (url: string, base: string) => string
 */
export const resolveUrl = (url, base) => new URL(url, base === "" ? undefined : base).href;

/**
 * The URL of what's retrieved, which is the URL without its fragment
 *
 * @type (url: string) => string
 */
export const withoutFragment = (url) => {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.href;
};
