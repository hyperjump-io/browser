import { fromJson } from "../../json/jsonast-util.js";

/**
 * @import * as API from "./json-media-type-plugin.d.ts"
 */

/** @implements API.JsonMediaTypePlugin */
export class JsonMediaTypePlugin {
  constructor() {
    this.mediaType = "application/json";
    this.extensions = [".json"];
  }

  /** @type API.JsonMediaTypePlugin["parse"] */
  async parse(response) {
    const result = fromJson(await response.text());
    if (result.status !== "success") {
      result.messages[0].fatal = true;
      throw result.messages[0];
    }

    return {
      type: "json-document",
      status: result.status,
      children: [result.node],
      comments: []
    };
  }
}
