import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetcher } from "../layers.js";
import { networkError, setResponseMeta, withUrl } from "../response-meta.js";
import { relativeFileUrl } from "../file-urls.js";

/**
 * @import * as API from "./file-scheme.d.ts"
 */

/**
 * Opening a FIFO waits for something to write to it, so it's opened without
 * waiting, and is then found not to be a file. A file opens the same way
 * either way. Windows has no FIFOs, and no `O_NONBLOCK`.
 */
const readFlags = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0);

/** @type typeof API.fileScheme */
export const fileScheme = (options = {}) => fetcher(async (request, ctx) => {
  ctx.record.mark("file:read", { priority: ctx.priority.value });
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw networkError(`'${relativeFileUrl(request.url)}' can't be fetched with ${request.method}. A file: URL can only be fetched with GET or HEAD.`, { code: "ERR_METHOD_NOT_SUPPORTED" }, request.url);
  }

  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  let written;
  try {
    written = fileURLToPath(url);
  } catch (error) {
    throw networkError(`'${relativeFileUrl(request.url)}' isn't a file URL: ${/** @type Error */ (error).message}`, error, request.url);
  }

  if (options.root !== undefined && !isInside(resolve(options.root), written)) {
    throw outsideRoot(request.url, options.root);
  }

  let root;
  try {
    root = options.root === undefined ? undefined : await realpath(options.root);
  } catch (error) {
    throw networkError(`The file: scheme's root, '${options.root}', can't be read (${codeOf(error)}), so '${relativeFileUrl(request.url)}' can't be fetched`, error, request.url);
  }

  // A symlink in `root` can point out of it, so it's checked again where it
  // leads. The file is opened before it's answered, so a file that can't be
  // read fails here, not partway through its body.
  let path;
  try {
    path = await realpath(written);
  } catch (error) {
    throw readError(request.url, error);
  }
  if (root !== undefined && !isInside(root, path)) {
    throw outsideRoot(request.url, /** @type string */ (options.root));
  }
  let handle;
  try {
    handle = await open(path, readFlags);
  } catch (error) {
    throw readError(request.url, error);
  }

  let stats;
  try {
    stats = await handle.stat();
  } catch (error) {
    await handle.close();
    throw readError(request.url, error);
  }
  if (!stats.isFile()) {
    await handle.close();
    throw networkError(`'${relativeFileUrl(request.url)}' is ${stats.isDirectory() ? "a directory" : "something other than a file"}, so it can't be fetched`, { code: "ERR_NOT_A_FILE" }, request.url);
  }

  const headers = new Headers({
    "content-length": String(stats.size),
    "last-modified": stats.mtime.toUTCString()
  });

  let body = null;
  if (request.method === "HEAD") {
    await handle.close();
  } else {
    body = /** @type ReadableStream<Uint8Array> */ (Readable.toWeb(handle.createReadStream({ signal: request.signal })));
  }
  const response = new Response(body, { status: 200, statusText: "OK", headers });
  const responseUrl = pathToFileURL(path);
  responseUrl.search = new URL(request.url).search;
  return setResponseMeta(withUrl(response, responseUrl.href), { source: "file" });
});

/** @type (url: string, root: string) => TypeError */
const outsideRoot = (url, root) => networkError(`'${relativeFileUrl(url)}' is outside the file: scheme's root, '${root}'`, { code: "ERR_OUTSIDE_ROOT" }, url);

/**
 * What a filesystem error means for the URL. Its cause is the filesystem's
 * error, with its `code`, like `ENOENT`.
 *
 * @type (url: string, error: unknown) => TypeError
 */
const readError = (url, error) => {
  const code = codeOf(error);
  if (code === "ENOENT" || code === "ENOTDIR") {
    return networkError(`'${relativeFileUrl(url)}' doesn't exist`, error, url);
  }
  if (code === "EACCES" || code === "EPERM") {
    return networkError(`'${relativeFileUrl(url)}' can't be read, because permission is denied`, error, url);
  }
  // The system's message says the absolute path, so only its code is said
  return networkError(`'${relativeFileUrl(url)}' can't be read (${codeOf(error)})`, error, url);
};

/** @type (error: unknown) => string | undefined */
const codeOf = (error) => /** @type NodeJS.ErrnoException */ (error).code;

/**
 * Whether a path is in a directory. Outside it, the path from the directory
 * starts with a `..` segment, but a name in it can start with `..` too.
 *
 * @type (root: string, path: string) => boolean
 */
const isInside = (root, path) => {
  const fromRoot = relative(root, path);
  return fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
};
