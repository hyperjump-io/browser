import { nullBodyStatuses } from "./statuses.js";
import { contextUrl } from "#context-url";

/**
 * @import * as API from "./registry.d.ts"
 */

/** @type typeof API.registry */
export const registry = (entries, options = {}) => {
  const base = options.base ?? contextUrl();

  /** @type Map<string, API.RegistryEntryFunction> */
  const byUrl = new Map();
  for (const [url, entry] of Symbol.iterator in entries ? /** @type Iterable<[string | URL, API.RegistryEntry]> */ (entries) : Object.entries(entries)) {
    byUrl.set(withoutFragment(new URL(url, base)), typeof entry === "function" ? entry : clones(entry));
  }

  return Object.freeze({
    get: (url, ctx) => byUrl.get(withoutFragment(new URL(url)))?.(url, ctx)
  });
};

/**
 * An entry's response, made once, and a clone of it each time it's asked for.
 * Making a response copies a body that's bytes, and its headers, so changing
 * the entry later changes nothing. A clone of a stream body is a branch of
 * it, so it's answered every time, by every session.
 *
 * @type (entry: Exclude<API.RegistryEntry, API.RegistryEntryFunction>) => API.RegistryEntryFunction
 */
const clones = (entry) => {
  const init = typeof entry === "object" && !(entry instanceof Uint8Array) && !(entry instanceof ArrayBuffer) && !(entry instanceof Blob)
    ? entry
    : { body: /** @type BodyInit */ (entry) };
  const status = init.status ?? 200;
  const body = nullBodyStatuses.has(status) ? null : init.body ?? null;
  const response = new Response(body, { status, statusText: init.statusText ?? "", headers: init.headers });
  return () => response.clone();
};

/** @type (url: URL) => string */
const withoutFragment = (url) => {
  url.hash = "";
  return url.href;
};
