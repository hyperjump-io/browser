import { fromJson, jsonSyntaxErrorMessage } from "../../json/jsonast-util.js";
import { fatalSyntaxError } from "../../json/report-syntax-errors.js";

/**
 * @import * as API from "./json-media-type-plugin.d.ts"
 */

/** @implements API.JsonMediaTypePlugin */
export class JsonMediaTypePlugin {
  /**
   * @param {API.JsonMediaTypePluginOptions} [options]
   */
  constructor(options = {}) {
    this.mediaType = "application/json";
    this.extensions = [".json"];
    this.quality = options.quality;
  }

  /** @type API.JsonMediaTypePlugin["parse"] */
  async parse(response) {
    const result = fromJson(await response.text(), response.url);
    if (result.status !== "success") {
      throw fatalSyntaxError(result.errors[0], jsonSyntaxErrorMessage);
    }

    return {
      type: "json-document",
      status: result.status,
      children: [result.node],
      comments: [],
      uri: response.url
    };
  }
}
