import { createReadStream } from "node:fs";
import { realpath } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseIri, toAbsoluteIri } from "@hyperjump/uri";
import { Readable } from "node:stream";
import { FileNotFoundError } from "../hyperjump.js";
import { relativeFileUri } from "../file-uris.js";

/**
 * @import * as API from "./file-scheme-plugin.d.ts"
 */

/** @implements API.FileUriSchemePlugin */
export class FileUriSchemePlugin {
  constructor() {
    this.schemes = ["file"];
  }

  /** @type API.FileUriSchemePlugin["retrieve"] */
  async retrieve(uri, options) {
    if (options.referencedFrom) {
      const { scheme } = parseIri(options.referencedFrom);

      // A scheme is case-insensitive
      if (scheme.toLowerCase() !== "file") {
        throw Error(`Accessing a file (${relativeFileUri(uri)}) from a non-filesystem context (${options.referencedFrom}) is not allowed`);
      }
    }

    // The file is read from its real path, which is also the response's URL,
    // so references resolve relative to where the file really is. That's
    // true for a symlink anywhere in the path, not only the file itself.
    const filePath = fileURLToPath(uri);
    let realFilePath;
    try {
      realFilePath = await realpath(filePath);
    } catch (error) {
      // Node.js's error says the absolute path, which isn't reported
      const code = /** @type {{ code?: unknown }} */ (error).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        throw new FileNotFoundError(uri);
      } else if (typeof code === "string") {
        throw Error(`Unable to read the file at '${relativeFileUri(uri)}' (${code})`);
      }
      throw error;
    }
    const responseUri = realFilePath === filePath ? toAbsoluteIri(uri) : pathToFileURL(realFilePath).toString();

    // A file doesn't have a media type, so it's the one its extension has
    const headers = new Headers();
    const mediaType = options.mediaTypeByExtension(responseUri);
    if (mediaType !== undefined) {
      headers.set("content-type", mediaType);
    }
    const stream = /** @type ReadableStream<Uint8Array> */ (Readable.toWeb(createReadStream(realFilePath)));
    const response = new Response(stream, { headers });
    Object.defineProperty(response, "url", { value: responseUri });

    return response;
  }
}
