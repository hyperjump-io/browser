import type { JsonDocumentNode } from "../../json/jsonast.d.ts";
import type { MediaTypePlugin } from "./media-type-plugin.d.ts";

/**
 * Supports JSON
 * - Media type: application/json
 * - Extensions: .json
 */
/**
 * Documents are only produced for valid JSON, so their status is always
 * `success`.
 */
export type JsonMediaTypeDocument = JsonDocumentNode<"success">;

export class JsonMediaTypePlugin implements MediaTypePlugin<JsonMediaTypeDocument> {
  mediaType: string;
  extensions: string[];
  quality?: number;
  parse: MediaTypePlugin<JsonMediaTypeDocument>["parse"];
}
