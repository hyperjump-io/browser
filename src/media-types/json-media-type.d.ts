import type { JsonDocumentNode } from "../json/jsonast.d.ts";
import type { MediaTypePlugin, ParseSource } from "./media-types.d.ts";

/**
 * Documents are only made for valid JSON, so their status is always
 * `success`.
 */
export type JsonMediaTypeDocument = JsonDocumentNode<"success">;

/**
 * JSON: `application/json`, and files that end with `.json`. A fragment
 * identifies the whole document.
 *
 * `parse` rejects with a `SyntaxError` for JSON with a syntax error. Its
 * `cause` is the first `JsonSyntaxError`, with the `code` `ERR_SYNTAX`, and
 * its `url` is the document's.
 */
export const jsonMediaType: Readonly<Omit<MediaTypePlugin<JsonMediaTypeDocument>, "parse"> & { parse(response: ParseSource): Promise<JsonMediaTypeDocument> }>;
