import { createReadStream } from "node:fs";
import { realpath } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseIri, toAbsoluteIri } from "@hyperjump/uri";
import { Readable } from "node:stream";

/**
 * @import { Hyperjump } from "../index.js"
 * @import * as API from "./file-scheme-plugin.d.ts"
 */

/** @implements API.FileUriSchemePlugin */
export class FileUriSchemePlugin {
  #hyperjump;

  /**
   * @param {Hyperjump<any>} hyperjump
   */
  constructor(hyperjump) {
    this.schemes = ["file"];

    this.#hyperjump = hyperjump;
  }

  /** @type API.FileUriSchemePlugin["retrieve"] */
  async retrieve(uri, options) {
    if (options.referencedFrom) {
      const { scheme } = parseIri(options.referencedFrom);

      if (scheme !== "file") {
        throw Error(`Accessing a file (${uri}) from a non-filesystem context (${options.referencedFrom}) is not allowed`);
      }
    }

    // The file is read from its real path, which is also the response's URL,
    // so references resolve relative to where the file really is. That's
    // true for a symlink anywhere in the path, not only the file itself.
    const filePath = fileURLToPath(uri);
    const realFilePath = await realpath(filePath);
    const responseUri = realFilePath === filePath ? toAbsoluteIri(uri) : pathToFileURL(realFilePath).toString();

    const contentType = this.#hyperjump.getMediaType(responseUri);
    const stream = /** @type ReadableStream<Uint8Array> */ (Readable.toWeb(createReadStream(realFilePath)));
    const response = new Response(stream, {
      headers: { "Content-Type": contentType }
    });
    Object.defineProperty(response, "url", { value: responseUri });

    return response;
  }
}
