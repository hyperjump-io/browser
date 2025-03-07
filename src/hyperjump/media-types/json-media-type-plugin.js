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
    return {
      type: "json-document",
      children: [fromJson(await response.text())]
    };
  }
}
