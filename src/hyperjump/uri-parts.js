/** @type (uri: string) => boolean */
export const hasScheme = (uri) => /^[a-z][a-z\d+.-]*:/i.test(uri);

/**
 * The URI without its fragment, as it's written. Making it absolute with a
 * URI library would normalize it too, and an application can be looking for
 * it as it's written, in a `getDocument` override.
 *
 * @type (uri: string) => string
 */
export const withoutFragment = (uri) => {
  const index = uri.indexOf("#");
  return index === -1 ? uri : uri.slice(0, index);
};
