import type { JrefDocumentNode } from "../../jref/jref-ast.d.ts";
import type { MediaTypePlugin } from "./media-type-plugin.d.ts";

/**
 * Supports JRef
 * - Media type: application/reference+json
 * - Extensions: .jref
 */
/**
 * Documents are only produced for valid JRef, so their status is always
 * `success`.
 */
export type JrefMediaTypeDocument = JrefDocumentNode<"success">;

export class JrefMediaTypePlugin implements MediaTypePlugin<JrefMediaTypeDocument> {
  mediaType: string;
  extensions: string[];
  quality?: number;
  parse: MediaTypePlugin<JrefMediaTypeDocument>["parse"];
}
