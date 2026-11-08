import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { toAbsoluteIri, urlToIri } from "@hyperjump/uri";

/**
 * @import { AbsoluteIri } from "@hyperjump/uri"
 */

/**
 * A file's URL as an IRI. A URL of a path has no fragment, so `toAbsoluteIri`
 * only makes it the type it is.
 *
 * @type (cwd: string, path: string) => AbsoluteIri
 */
export const pathToUri = (cwd, path) => toAbsoluteIri(urlToIri(pathToFileURL(resolve(cwd, path))));
