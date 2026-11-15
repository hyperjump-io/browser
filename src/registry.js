import { nullBodyStatuses } from "./statuses.js";
import { contextUrl } from "#context-url";

/**
 * @import * as API from "./registry.d.ts"
 */

/** @type typeof API.registry */
export const registry = (entries, options = {}) => {
  const base = options.base ?? contextUrl();

  /** @type Map<string, API.RegistryEntry> */
  const byUrl = new Map();
  for (const [url, entry] of Symbol.iterator in entries ? /** @type Iterable<[string | URL, API.RegistryEntry]> */ (entries) : Object.entries(entries)) {
    byUrl.set(withoutFragment(new URL(url, base)), entry);
  }

  return Object.freeze({
    get: (url, ctx) => {
      const entry = byUrl.get(withoutFragment(new URL(url)));
      return entry === undefined ? undefined : entryResponse(entry, url, ctx);
    }
  });
};

/**
 * A new response for an entry. A body can only be read once, so each time
 * gets its own.
 *
 * @type (entry: API.RegistryEntry, url: string, ctx: API.RegistryContext) => Response | Promise<Response>
 */
const entryResponse = (entry, url, ctx) => {
  if (typeof entry === "function") {
    return entry(url, ctx);
  }

  const init = typeof entry === "object" && !(entry instanceof Uint8Array) && !(entry instanceof ArrayBuffer) && !(entry instanceof Blob)
    ? entry
    : { body: /** @type BodyInit */ (entry) };
  const status = init.status ?? 200;
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && entry instanceof Blob && entry.type) {
    headers.set("content-type", entry.type);
  }
  const body = nullBodyStatuses.has(status) ? null : init.body ?? null;
  return new Response(body, { status, statusText: init.statusText ?? "", headers });
};

/** @type (url: URL) => string */
const withoutFragment = (url) => {
  url.hash = "";
  return url.href;
};
