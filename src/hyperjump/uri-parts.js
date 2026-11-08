import { hasScheme, toAbsoluteIri } from "@hyperjump/uri";

/**
 * @import { AbsoluteIri, IriReference } from "@hyperjump/uri"
 */

/**
 * The URI of the document a node is in, from the node's location, as it's
 * written, so a `getDocument` override finds it that way. A document without
 * a URI has locations that are only fragments, like `#/a`, so it has none.
 *
 * @type (location: IriReference) => AbsoluteIri | undefined
 */
export const documentUriOf = (location) => hasScheme(location) ? toAbsoluteIri(location) : undefined;
