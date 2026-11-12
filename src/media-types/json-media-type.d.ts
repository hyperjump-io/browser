import type { JsonDocumentNode } from "../json/jsonast.d.ts";
import type { MediaTypePlugin } from "./media-types.d.ts";

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
 * `cause` is the first `JsonSyntaxError`.
 */
export const jsonMediaType: Readonly<MediaTypePlugin<JsonMediaTypeDocument>>;
