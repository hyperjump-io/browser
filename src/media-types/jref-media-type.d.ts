import type { JrefDocumentNode } from "../jref/jref-ast.d.ts";
import type { MediaTypePlugin, ParseSource } from "./media-types.d.ts";

/**
 * Documents are only made for valid JRef, so their status is always
 * `success`.
 */
export type JrefMediaTypeDocument = JrefDocumentNode<"success">;

/**
 * JRef: `application/reference+json`, and files that end with `.jref`. A
 * fragment is a JSON Pointer.
 *
 * `parse` rejects with a `SyntaxError` for JRef with a syntax error, or
 * with a reference that isn't a URL. Its `cause` is the first error, with
 * the `code` `ERR_SYNTAX`, and its `url` is the document's.
 */
export const jrefMediaType: Readonly<Omit<MediaTypePlugin<JrefMediaTypeDocument>, "parse"> & { parse(response: ParseSource): Promise<JrefMediaTypeDocument> }>;
