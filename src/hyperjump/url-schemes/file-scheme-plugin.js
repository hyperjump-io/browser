import { createReadStream } from "node:fs";
import { realpath } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { FileNotFoundError } from "../hyperjump.js";
import { relativeFileUrl } from "../file-urls.js";

/**
 * @import * as API from "./file-scheme-plugin.d.ts"
 */

/** @implements API.FileUrlSchemePlugin */
export class FileUrlSchemePlugin {
  constructor() {
    this.schemes = ["file"];
  }

  /** @type API.FileUrlSchemePlugin["retrieve"] */
  async retrieve(url, options) {
    // The file is read from its real path, which is also the response's URL,
    // so references resolve relative to where the file really is. That's
    // true for a symlink anywhere in the path, not only the file itself.
    const filePath = fileURLToPath(url);
    let realFilePath;
    try {
      realFilePath = await realpath(filePath);
    } catch (error) {
      // Node.js's error says the absolute path, which isn't reported
      const code = /** @type {{ code?: unknown }} */ (error).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        throw new FileNotFoundError(url);
      } else if (typeof code === "string") {
        throw Error(`Unable to read the file at '${relativeFileUrl(url)}' (${code})`);
      }
      throw error;
    }
    const responseUrl = realFilePath === filePath ? url : pathToFileURL(realFilePath).href;

    // A file doesn't have a media type, so it's the one its extension has
    const headers = new Headers();
    const mediaType = options.mediaTypeByExtension(responseUrl);
    if (mediaType !== undefined) {
      headers.set("content-type", mediaType);
    }
    const stream = /** @type ReadableStream<Uint8Array> */ (Readable.toWeb(createReadStream(realFilePath)));
    const response = new Response(stream, { headers });
    Object.defineProperty(response, "url", { value: responseUrl });

    return response;
  }
}
