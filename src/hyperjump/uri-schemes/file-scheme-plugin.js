import { createReadStream } from "node:fs";
import { readlink, lstat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseIri, toAbsoluteIri } from "@hyperjump/uri";
import { Readable } from "node:stream";

/**
 * @import { Hyperjump } from "../index.js"
 * @import { UriSchemePlugin } from "./uri-scheme-plugin.js"
 */


/** @implements UriSchemePlugin */
export class FileUriSchemePlugin {
  #hyperjump;

  /**
   * @param {Hyperjump} hyperjump
   */
  constructor(hyperjump) {
    this.#hyperjump = hyperjump;
  }

  /** @type UriSchemePlugin["retrieve"] */
  async retrieve(uri, baseUri) {
    const { scheme } = parseIri(baseUri);

    if (baseUri) {
      if (scheme !== "file") {
        throw Error(`Accessing a file (${uri}) from a non-filesystem document (${baseUri}) is not allowed`);
      }
    }

    let responseUri = toAbsoluteIri(uri);

    const filePath = fileURLToPath(uri);
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      responseUri = pathToFileURL(await readlink(filePath)).toString();
    }

    const contentType = await this.#hyperjump.getFileMediaType(responseUri);
    const stream = /** @type ReadableStream<Uint8Array> */ (Readable.toWeb(createReadStream(filePath)));
    const response = new Response(stream, {
      headers: { "Content-Type": contentType }
    });
    Object.defineProperty(response, "url", { value: responseUri });

    return response;
  }
}
