import { join } from "node:path";
import { cwd } from "node:process";
import { pathToFileURL } from "node:url";
import { toAbsoluteIri, urlToIri } from "@hyperjump/uri";

/**
 * @import { AbsoluteIri } from "@hyperjump/uri"
 */

/**
 * The working directory, as a folder. It's the same type as the browser's,
 * which doesn't always have one. A URL of a path has no fragment, so
 * `toAbsoluteIri` only makes it the type it is.
 *
 * @type () => AbsoluteIri | undefined
 */
export const contextUri = () => toAbsoluteIri(urlToIri(pathToFileURL(join(cwd(), "/"))));
