import { entryResponse, withoutFragment } from "./entry-response.js";
import { setResponseMeta, withUrl } from "../response-meta.js";
import { nullBodyStatuses } from "../statuses.js";

/**
 * @import * as API from "./resource-map.d.ts"
 * @import { RegistryEntry } from "./registry.d.ts"
 * @import { Fetcher } from "../layers.d.ts"
 * @import { Session } from "../session.d.ts"
 */

/** @typedef {{ entry: RegistryEntry, value: unknown, fingerprint: string | undefined }} Stored */

/** @implements API.ResourceMap */
export class ResourceMap {
  /** @type boolean */
  #inherit;

  /**
   * @param {Fetcher} inner
   * @param {API.ResourceMapOptions} [options]
   */
  constructor(inner, options = {}) {
    this.inner = inner;
    this.#inherit = options.inherit ?? true;
  }

  /** @type API.ResourceMap["register"] */
  register(session, url, entry, options = {}) {
    const key = withoutFragment(url);
    const table = this.#table(session);
    const fingerprint = fingerprintOf(entry);
    const existing = table.get(key);
    if (existing) {
      if (fingerprint !== undefined && existing.fingerprint === fingerprint) {
        return false;
      }
      throw Error(`'${key}' is already registered in this session with different content`);
    }
    table.set(key, { entry, value: options.value, fingerprint });
    return true;
  }

  /** @type API.ResourceMap["lookup"] */
  lookup(session, url) {
    const key = withoutFragment(url);
    for (const scope of this.#inherit ? session.lineage() : [session]) {
      const stored = this.#table(scope).get(key);
      if (stored) {
        return { url: key, entry: stored.entry, value: stored.value, session: scope };
      }
    }
    return undefined;
  }

  /** @type API.ResourceMap["urls"] */
  urls(session) {
    return this.#table(session).keys();
  }

  /** @type API.ResourceMap["fetch"] */
  async fetch(request, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return this.inner.fetch(request, ctx);
    }
    const found = this.lookup(ctx.session, request.url);
    if (!found) {
      return this.inner.fetch(request, ctx);
    }

    let response = await entryResponse(found.entry, request, ctx);
    if (response.body && (request.method === "HEAD" || nullBodyStatuses.has(response.status))) {
      await response.body.cancel();
      response = new Response(null, response);
    }
    if (!response.url) {
      withUrl(response, found.url);
    }
    return setResponseMeta(response, { source: "resource-map", value: found.value });
  }

  /** @type (session: Session) => Map<string, Stored> */
  #table(session) {
    return session.state(this, () => new Map());
  }
}

/** @type typeof API.resourceMap */
export const resourceMap = (options) => (inner) => new ResourceMap(inner, options);

/**
 * Enough to tell the same text or bytes registered again from something else
 * under the same URL
 *
 * @type (entry: RegistryEntry) => string | undefined
 */
const fingerprintOf = (entry) => {
  const body = typeof entry === "object" && entry !== null && "body" in entry && !(entry instanceof Blob) ? entry.body : entry;
  if (typeof body === "string") {
    return `s:${body}`;
  } else if (body instanceof Uint8Array) {
    return `b:${[...body].join(",")}`;
  } else {
    return undefined;
  }
};
