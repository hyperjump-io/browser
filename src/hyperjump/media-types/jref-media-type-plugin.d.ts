import type { JrefDocumentNode } from "../../jref/jref-ast.d.ts";
import type { MediaTypePlugin } from "./media-type-plugin.d.ts";

/**
 * Documents are only produced for valid JRef, so their status is always
 * `success`.
 */
export type JrefMediaTypeDocument = JrefDocumentNode<"success">;

/**
 * Supports JRef
 * - Media type: application/reference+json
 * - Extensions: .jref
 */
export class JrefMediaTypePlugin implements MediaTypePlugin<JrefMediaTypeDocument> {
  constructor(options?: JrefMediaTypePluginOptions);

  mediaType: string;
  extensions: string[];
  quality?: number;
  parse(response: Response): Promise<JrefMediaTypeDocument>;

  /** A fragment is a percent-encoded JSON Pointer. */
  fragmentPointer(document: JrefMediaTypeDocument, fragment: string): string;
}

export type JrefMediaTypePluginOptions = {
  /**
   * The quality of the media type in the `Accept` header, from 0 to 1.
   * Without it, there's no quality, which servers take to be 1.
   */
  quality?: number;
};
