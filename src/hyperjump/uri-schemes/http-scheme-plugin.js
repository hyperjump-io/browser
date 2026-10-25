import CachePolicy from "http-cache-semantics";
import { toAbsoluteIri } from "@hyperjump/uri";

/**
 * @import { Hyperjump } from "../index.js"
 * @import { HttpCacheStore } from "./http-cache-store.d.ts"
 * @import * as API from "./http-scheme-plugin.d.ts"
 */

/**
 * A response with its body read, so it can be cached and given to more than
 * one request.
 *
 * @typedef {{
 *   url: string;
 *   status: number;
 *   headers: Record<string, string>;
 *   body: string;
 * }} ReadResponse
 */

/** @implements API.HttpUriSchemePlugin */
export class HttpUriSchemePlugin {
  #hyperjump;
  #successStatus;

  /** @type HttpCacheStore | undefined */
  #cache;

  /** @type API.HttpUriSchemePluginOptions["headers"] */
  #headers;

  /**
   * Responses being retrieved, by URL, so concurrent requests for the same
   * URL share one request.
   *
   * @type Map<string, Promise<ReadResponse>>
   */
  #pending;

  /**
   * @param {Hyperjump<any>} hyperjump
   * @param {API.HttpUriSchemePluginOptions} [options]
   */
  constructor(hyperjump, options = {}) {
    this.schemes = ["http", "https"];

    this.#hyperjump = hyperjump;
    this.#successStatus = new Set([200, 203]);
    this.#cache = options.cache;
    this.#headers = options.headers;
    this.#pending = new Map();
  }

  /** @type API.HttpUriSchemePlugin["retrieve"] */
  async retrieve(uri) {
    if (!this.#cache) {
      const response = await fetch(uri, { headers: await this.#requestHeaders(uri) });
      this.#assertSuccess(uri, response);

      return response;
    }

    const url = toAbsoluteIri(uri);
    let pending = this.#pending.get(url);
    if (!pending) {
      pending = this.#retrieveCached(url, this.#cache).finally(() => {
        this.#pending.delete(url);
      });
      this.#pending.set(url, pending);
    }

    const { body, status, headers, url: responseUrl } = await pending;
    // A string body would get a `Content-Type` if the response doesn't have one
    const response = new Response(new TextEncoder().encode(body), { status, headers });
    Object.defineProperty(response, "url", { value: responseUrl });

    return response;
  }

  /** @type (url: string, cache: HttpCacheStore) => Promise<ReadResponse> */
  async #retrieveCached(url, cache) {
    // The cache needs every header sent so it can match a `Vary`
    const request = { url, method: "GET", headers: await this.#requestHeaders(url) };

    const cached = await cache.get(url);
    const cachedPolicy = cached && CachePolicy.fromObject(cached.policy);
    if (cached && cachedPolicy?.satisfiesWithoutRevalidation(request)) {
      return { url: cached.url, status: cachedPolicy.status(), headers: cachedPolicy.responseHeaders(), body: cached.body };
    }

    let response = await fetch(url, {
      headers: cachedPolicy ? cachedPolicy.revalidationHeaders(request) : request.headers
    });
    let responseHeaders = Object.fromEntries(response.headers);

    if (cached && cachedPolicy) {
      const { policy, modified, matches } = cachedPolicy.revalidatedPolicy(request, { status: response.status, headers: responseHeaders });
      if (response.status === 304 && !matches) {
        // A 304 that doesn't match the cached response has no body to use, so
        // the response is retrieved again without revalidating
        response = await fetch(url, { headers: request.headers });
        responseHeaders = Object.fromEntries(response.headers);
      } else if (!modified) {
        // A revalidated response that wasn't modified only updates the cached
        // response's headers
        await cache.set(url, { ...cached, policy: policy.toObject() });
        return { url: cached.url, status: policy.status(), headers: policy.responseHeaders(), body: cached.body };
      }
    }

    this.#assertSuccess(url, response);
    const body = await response.text();

    const policy = new CachePolicy(request, { status: response.status, headers: responseHeaders }, { shared: false });
    if (isWorthCaching(policy, responseHeaders)) {
      await cache.set(url, { url: response.url, body, policy: policy.toObject() });
    } else if (cached) {
      await cache.delete(url);
    }

    return { url: response.url, status: response.status, headers: responseHeaders, body };
  }

  /** @type (uri: string) => Promise<Record<string, string>> */
  async #requestHeaders(uri) {
    const headers = new Headers(await this.#headers?.(new URL(uri)));
    headers.set("accept", this.#hyperjump.acceptableMediaTypes());

    return Object.fromEntries(headers);
  }

  /** @type (uri: string, response: Response) => void */
  #assertSuccess(uri, response) {
    if (response.status >= 400) {
      throw new HttpError(response, `Failed to retrieve '${uri}'`);
    }

    if (!this.#successStatus.has(response.status)) {
      throw new HttpError(response, "Unsupported HTTP response status code");
    }
  }
}

export class HttpError extends Error {
  /**
   * @param {Response} response
   * @param {string} [message]
   */
  constructor(response, message) {
    super(`${response.status} ${response.statusText}${message ? ` -- ${message}` : ""}`);
    this.name = this.constructor.name;
    this.response = response;
  }
}

/**
 * A response that's stale as soon as it's stored and can't be revalidated
 * would never be used again.
 *
 * @type (policy: CachePolicy, headers: Record<string, string>) => boolean
 */
const isWorthCaching = (policy, headers) => {
  return policy.storable() && (policy.timeToLive() > 0 || "etag" in headers || "last-modified" in headers);
};
