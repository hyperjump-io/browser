/**
 * A URL without its fragment. The first `#` in a URL's `href` starts its
 * fragment, because the URL Standard encodes one anywhere else.
 *
 * @type (url: string) => string
 */
export const withoutFragment = (url) => {
  const fragmentStart = url.indexOf("#");
  return fragmentStart === -1 ? url : url.slice(0, fragmentStart);
};

/**
 * A document's URL from outside Browser, like what's given to `fromJson`.
 * Its nodes' locations are the URL with a fragment, so it can't have one.
 *
 * @type (url: string) => string
 */
export const parseDocumentUrl = (url) => {
  const { href } = new URL(url);
  if (href.includes("#")) {
    throw TypeError(`A document's URL can't have a fragment: '${url}'`);
  }
  return href;
};
