import type { JsonDocumentNode } from "../../json/jsonast.d.ts";
import type { MediaTypePlugin } from "./media-type-plugin.d.ts";


/**
 * Supports JSON
 * - Media type: application/json
 * - Extensions: .json
 */
export class JsonMediaTypePlugin implements MediaTypePlugin<JsonDocumentNode> {
  mediaType: string;
  extensions: string[];
  quality?: number;
  parse: MediaTypePlugin<JsonDocumentNode>["parse"];
}
