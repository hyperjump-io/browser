import { toAbsoluteIri, urlToIri } from "@hyperjump/uri";

/**
 * @import { AbsoluteIri } from "@hyperjump/uri"
 */

/**
 * The page, without its fragment, since a base can't have one. There's none
 * without a document, such as in a worker.
 *
 * @type () => AbsoluteIri | undefined
 */
export const contextUri = () => {
  const href = globalThis.document?.location?.href;
  return href === undefined ? undefined : toAbsoluteIri(urlToIri(new URL(href)));
};
