/**
 * The page, without its fragment, since a base can't have one. There's none
 * without a document, such as in a worker.
 *
 * @type () => URL | undefined
 */
export const contextUrl = () => {
  const href = globalThis.document?.location?.href;
  if (href === undefined) {
    return undefined;
  }
  const url = new URL(href);
  url.hash = "";
  return url;
};

/** What's local to the application by default: the page's origin */
export const defaultAllowRetrieval = ["/"];
