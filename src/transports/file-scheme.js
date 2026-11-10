import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
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
  let path;
  try {
    path = fileURLToPath(url);
  } catch (error) {
    throw networkError(`'${request.url}' isn't a file URL`, error);
  }

  if (options.root !== undefined && !isInside(resolve(options.root), path)) {
    throw networkError(`'${request.url}' is outside the allowed root`);
  }

  let stats;
  try {
    stats = await stat(path);
  } catch (error) {
    throw networkError(`Failed to fetch '${request.url}'`, error);
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
  return setResponseMeta(withUrl(response, request.url), { source: "file" });
});

/** @type (root: string, path: string) => boolean */
const isInside = (root, path) => {
  const fromRoot = relative(root, path);
  return !fromRoot.startsWith("..") && !isAbsolute(fromRoot);
};
