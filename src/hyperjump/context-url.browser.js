import { withoutFragment } from "./url-parts.js";

/**
 * The page, without its fragment, since a base can't have one. There's none
 * without a document, such as in a worker.
 *
 * @type () => string | undefined
 */
export const contextUrl = () => {
  const href = globalThis.document?.location?.href;
  return href === undefined ? undefined : withoutFragment(href);
};
