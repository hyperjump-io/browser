import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetcher } from "../layers.js";
import { contentTypeByExtension } from "../content-type.js";
import { networkError, setResponseMeta, withUrl } from "../response-meta.js";

/**
 * @import * as API from "./file-scheme.d.ts"
 */

/** @type typeof API.fileScheme */
export const fileScheme = (options = {}) => fetcher(async (request, ctx) => {
  ctx.record.mark("file:read", { priority: ctx.priority.value });
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw networkError(`${request.method} isn't allowed for file: URLs`);
  }

  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  let written;
  try {
    written = fileURLToPath(url);
  } catch (error) {
    throw networkError(`'${request.url}' isn't a file URL`, error);
  }

  if (options.root !== undefined && !isInside(resolve(options.root), written)) {
    throw networkError(`'${request.url}' is outside the allowed root`);
  }

  // A symlink in `root` can point out of it, so it's checked again where it leads
  let path;
  let root;
  let stats;
  try {
    path = await realpath(written);
    root = options.root === undefined ? undefined : await realpath(options.root);
    stats = await stat(path);
  } catch (error) {
    throw networkError(`Failed to fetch '${request.url}'`, error);
  }
  if (root !== undefined && !isInside(root, path)) {
    throw networkError(`'${request.url}' is outside the allowed root`);
  }
  if (!stats.isFile()) {
    throw networkError(`'${request.url}' isn't a file`);
  }

  const headers = new Headers({
    "content-length": String(stats.size),
    "last-modified": stats.mtime.toUTCString()
  });
  const contentType = contentTypeByExtension(path, options.contentTypes);
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const body = request.method === "HEAD"
    ? null
    : /** @type ReadableStream<Uint8Array> */ (Readable.toWeb(createReadStream(path, { signal: request.signal })));
  const response = new Response(body, { status: 200, statusText: "OK", headers });
  const responseUrl = pathToFileURL(path);
  responseUrl.search = new URL(request.url).search;
  return setResponseMeta(withUrl(response, responseUrl.href), { source: "file" });
});

/** @type (root: string, path: string) => boolean */
const isInside = (root, path) => {
  const fromRoot = relative(root, path);
  return !fromRoot.startsWith("..") && !isAbsolute(fromRoot);
};
