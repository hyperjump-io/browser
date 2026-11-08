import type { JsonDocumentNode } from "../../json/jsonast.d.ts";
import type { MediaTypePlugin, RetrievedResponse } from "./media-type-plugin.d.ts";

/**
 * Documents are only produced for valid JSON, so their status is always
 * `success`.
 */
export type JsonMediaTypeDocument = JsonDocumentNode<"success">;

/**
 * Supports JSON
 * - Media type: application/json
 * - Extensions: .json
 */
export class JsonMediaTypePlugin implements MediaTypePlugin<JsonMediaTypeDocument> {
  constructor(options?: JsonMediaTypePluginOptions);

  mediaType: string;
  extensions: string[];
  quality?: number;
  parse(response: RetrievedResponse): Promise<JsonMediaTypeDocument>;
}

export type JsonMediaTypePluginOptions = {
  /**
   * The quality of the media type in the `Accept` header, from 0 to 1.
   * Without it, there's no quality, which servers take to be 1.
   */
  quality?: number;
};
