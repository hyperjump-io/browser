import { contentTypeByExtension } from "../content-type.js";
import { nullBodyStatuses } from "../statuses.js";

/**
 * @import { RegistryEntry } from "./registry.d.ts"
 * @import { FetchContext } from "../layers.d.ts"
 */

/**
 * A new response for an entry of a registry. A body can
 * only be read once, so each request gets its own.
 *
 * @type (entry: RegistryEntry, request: Request, ctx: FetchContext) => Promise<Response>
 */
export const entryResponse = async (entry, request, ctx) => {
  if (typeof entry === "function") {
    return entry(request, ctx);
  }

  const init = typeof entry === "object" && !(entry instanceof Uint8Array) && !(entry instanceof ArrayBuffer) && !(entry instanceof Blob)
    ? entry
    : { body: /** @type BodyInit */ (entry) };

  const status = init.status ?? 200;
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    const contentType = entry instanceof Blob && entry.type ? entry.type : contentTypeByExtension(new URL(request.url).pathname);
    if (contentType) {
      headers.set("content-type", contentType);
    }
  }
  const body = nullBodyStatuses.has(status) ? null : init.body ?? null;
  return new Response(body, { status, statusText: init.statusText ?? "", headers });
};

/**
 * A URL without its fragment, which isn't part of what's fetched
 *
 * @type (url: string | URL) => string
 */
export const withoutFragment = (url) => {
  const copy = new URL(url);
  copy.hash = "";
  return copy.href;
};
