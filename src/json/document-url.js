/**
 * A document's URL from outside, like what's given to `fromJson`. Its
 * nodes' locations are the URL with a fragment, so it can't have one.
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
