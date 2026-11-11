import { entryResponse, withoutFragment } from "./entry-response.js";
import { responseMeta, setResponseMeta, withUrl } from "../response-meta.js";
import { nullBodyStatuses } from "../statuses.js";

/**
 * @import * as API from "./resource-map.d.ts"
 * @import { RegistryEntry } from "./registry.d.ts"
 * @import { Fetcher } from "../layers.d.ts"
 * @import { FetchRecord } from "../fetch-record.d.ts"
 */

/** @typedef {{ entry: RegistryEntry, value: unknown, fingerprint: string | undefined }} Stored */

/**
 * The resources a document contains. A document and the resources the map
 * answered from it have the same one.
 *
 * @typedef {Map<string, Stored>} ResourceSet
 */

/** @implements API.ResourceMap */
export class ResourceMap {
  /** @param {Fetcher} inner */
  constructor(inner) {
    this.inner = inner;
  }

  /** @type API.ResourceMap["register"] */
  register(container, url, entry, options = {}) {
    const record = recordOf(container);
    if (!record) {
      throw TypeError("A resource can only be registered in a response from a session, or its record");
    }

    const resources = this.#setOf(record) ?? new Map();
    this.#sets(record).set(record, resources);

    const key = withoutFragment(url);
    const fingerprint = fingerprintOf(entry);
    const existing = resources.get(key);
    if (existing) {
      if (fingerprint !== undefined && existing.fingerprint === fingerprint) {
        return false;
      }
      throw Error(`'${key}' is already registered in this document with different content`);
    }
    resources.set(key, { entry, value: options.value, fingerprint });
    return true;
  }

  /** @type API.ResourceMap["lookup"] */
  lookup(initiator, url) {
    const key = withoutFragment(url);
    const stored = this.#setOf(recordOf(initiator))?.get(key);
    return stored && { url: key, entry: stored.entry, value: stored.value };
  }

  /** @type API.ResourceMap["urls"] */
  urls(container) {
    return (this.#setOf(recordOf(container)) ?? new Map()).keys();
  }

  /** @type API.ResourceMap["fetch"] */
  async fetch(request, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return this.inner.fetch(request, ctx);
    }
    const key = withoutFragment(request.url);
    const resources = this.#setOf(ctx.record.initiator);
    const found = resources?.get(key);
    if (!resources || !found) {
      return this.inner.fetch(request, ctx);
    }

    // What this request gets was found in the initiator's document, so what
    // it causes is too
    this.#sets(ctx.record).set(ctx.record, resources);

    let response = await entryResponse(found.entry, request, ctx);
    if (response.body && (request.method === "HEAD" || nullBodyStatuses.has(response.status))) {
      await response.body.cancel();
      response = new Response(null, response);
    }
    if (!response.url) {
      withUrl(response, key);
    }
    return setResponseMeta(response, { source: "resource-map", value: found.value });
  }

  /** @type (record: FetchRecord | undefined) => ResourceSet | undefined */
  #setOf(record) {
    return record && this.#sets(record).get(record);
  }

  /**
   * Each record's set, kept in the record's session, so it lives as long as
   * the session does
   *
   * @type (record: FetchRecord) => WeakMap<FetchRecord, ResourceSet>
   */
  #sets(record) {
    return record.session.state(this, () => new WeakMap());
  }
}

/** @type typeof API.resourceMap */
export const resourceMap = () => (inner) => new ResourceMap(inner);

/** @type (from: Response | FetchRecord) => FetchRecord | undefined */
const recordOf = (from) => from instanceof Response ? responseMeta(from).record : from;

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
