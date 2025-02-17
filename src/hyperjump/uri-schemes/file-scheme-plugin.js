import { createReadStream } from "node:fs";
import { readlink, lstat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseIri, toAbsoluteIri } from "@hyperjump/uri";
import { Readable } from "node:stream";

/**
 * @import { Hyperjump } from "../index.js"
 * @import { UriSchemePlugin } from "./uri-scheme-plugin.js"
 */


/**
 * Supports the `file:` URI scheme. Media type is determined by file extensions.
 *
 * @implements UriSchemePlugin
 */
export class FileUriSchemePlugin {
  #hyperjump;

  /**
   * @param {Hyperjump} hyperjump
   */
  constructor(hyperjump) {
    this.schemes = ["file"];

    this.#hyperjump = hyperjump;
  }

  /** @type UriSchemePlugin["retrieve"] */
  async retrieve(uri, options) {
    if (options.referencedFrom) {
      const { scheme } = parseIri(options.referencedFrom);

      if (scheme !== "file") {
        throw Error(`Accessing a file (${uri}) from a non-filesystem context (${options.referencedFrom}) is not allowed`);
      }
    }

    let responseUri = toAbsoluteIri(uri);

    const filePath = fileURLToPath(uri);
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      responseUri = pathToFileURL(await readlink(filePath)).toString();
    }

    const contentType = this.#hyperjump.getMediaType(responseUri);
    const stream = /** @type ReadableStream<Uint8Array> */ (Readable.toWeb(createReadStream(filePath)));
    const response = new Response(stream, {
      headers: { "Content-Type": contentType }
    });
    Object.defineProperty(response, "url", { value: responseUri });

    return response;
  }
}
