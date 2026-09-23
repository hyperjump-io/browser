import type { JrefDocumentNode } from "../../jref/jref-ast.d.ts";
import type { MediaTypePlugin } from "./media-type-plugin.d.ts";

/**
 * Supports JRef
 * - Media type: application/reference+json
 * - Extensions: .jref
 */
export class JrefMediaTypePlugin implements MediaTypePlugin<JrefDocumentNode> {
  mediaType: string;
  extensions: string[];
  quality?: number;
  parse: MediaTypePlugin<JrefDocumentNode>["parse"];
}
