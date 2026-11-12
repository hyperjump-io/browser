import { entryResponse, withoutFragment } from "./entry-response.js";
import { networkError, setResponseMeta, withUrl } from "../response-meta.js";

/**
 * @import * as API from "./registry.d.ts"
 * @import { Fetcher } from "../layers.d.ts"
 */

/** @implements API.Registry */
export class Registry {
  /** @type Map<string, API.RegistryEntry> */
  #entries = new Map();

  /** @type API.RegistryOptions */
  #options;

  /**
   * @param {Fetcher} inner
   * @param {API.RegistryOptions} [options]
   */
  constructor(inner, options = {}) {
    this.inner = inner;
    this.#options = options;
    const source = options.entries ?? {};
    const pairs = Symbol.iterator in source
      ? /** @type Iterable<[string | URL, API.RegistryEntry]> */ (source)
      : Object.entries(source);
    for (const [url, entry] of pairs) {
      this.#entries.set(withoutFragment(new URL(url, options.base)), entry);
    }
  }

  /** @type API.Registry["has"] */
  has(url) {
    return this.#entries.has(withoutFragment(new URL(url, this.#options.base)));
  }

  /** @type API.Registry["urls"] */
  urls() {
    return this.#entries.keys();
  }

  /** @type API.Registry["fetch"] */
  async fetch(request, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return this.inner.fetch(request, ctx);
    }

    const url = new URL(request.url);
    const entry = this.#entries.get(withoutFragment(url)) ?? await this.#options.resolve?.(url, request);
    if (entry === undefined) {
      if (this.#options.onMiss === "error") {
        throw networkError(`'${request.url}' isn't in the registry, and its onMiss is "error"`, { code: "ERR_NOT_IN_REGISTRY" });
      }
      return this.inner.fetch(request, ctx);
    }

    let response = await entryResponse(entry, request, ctx);
    if (request.method === "HEAD" && response.body) {
      await response.body.cancel();
      response = new Response(null, response);
    }
    // A response's URL doesn't have a fragment
    return setResponseMeta(response.url ? response : withUrl(response, withoutFragment(url)), { source: "registry" });
  }
}

/** @type typeof API.registry */
export const registry = (options) => (inner) => new Registry(inner, options);
