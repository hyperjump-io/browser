import CachePolicy from "http-cache-semantics";

/**
 * @import { Fetch, Layer } from "./layers.js"
 * @import { HttpCacheStore } from "./url-schemes/http-cache-store.d.ts"
 * @import * as API from "./http-cache.d.ts"
 */

/**
 * A response with its body read, so it can be given to more than one
 * request
 *
 * @typedef {{
 *   url: string;
 *   status: number;
 *   statusText: string;
 *   headers: Record<string, string>;
 *   body: string;
 * }} ReadResponse
 */

/** A success, or a redirect, which are the responses that are cached */
const cachedStatuses = new Set([200, 203, 301, 302, 303, 307, 308]);

/**
 * The HTTP cache every session from a `Hyperjump` shares: a store, and the
 * requests in flight, so sessions that ask for the same URL at the same
 * time share one request.
 *
 * @implements API.HttpCache
 */
export class HttpCache {
  /** @type HttpCacheStore */
  #store;

  /**
   * Responses being retrieved, by URL and headers. Requests for the same URL
   * with different headers don't share one, because a `Vary` could have kept
   * them apart. A response that isn't cached, like an error, is the
   * request's as it came, with its body unread, so it isn't shared.
   *
   * @type Map<string, Promise<ReadResponse | Response>>
   */
  #pending;

  /** @param {HttpCacheStore} store */
  constructor(store) {
    this.#store = store;
    this.#pending = new Map();
  }

  /** @type API.HttpCache["retrieve"] */
  async retrieve(request, next) {
    // A `Referer` says where a reference came from, not what's asked for, so
    // it doesn't keep requests from sharing a response. The `http(s):`
    // plugin doesn't send it.
    const headers = new Headers(request.headers);
    headers.delete("referer");
    const policyRequest = { url: request.url, method: "GET", headers: Object.fromEntries(headers) };

    const key = JSON.stringify([request.url, policyRequest.headers]);
    let pending = this.#pending.get(key);
    const shared = pending !== undefined;
    if (!pending) {
      pending = this.#retrieve(request, policyRequest, next).finally(() => {
        this.#pending.delete(key);
      });
      this.#pending.set(key, pending);
    }

    const result = await pending;
    if (result instanceof Response) {
      return shared ? next(request) : result;
    }

    return toResponse(result);
  }

  /** @type (request: Request, policyRequest: { url: string, method: string, headers: Record<string, string> }, next: Fetch) => Promise<ReadResponse | Response> */
  async #retrieve(request, policyRequest, next) {
    const { url } = policyRequest;
    const cached = await this.#store.get(url);
    const cachedPolicy = cached && CachePolicy.fromObject(cached.policy);
    if (cached && cachedPolicy?.satisfiesWithoutRevalidation(policyRequest)) {
      return { url: cached.url, status: cachedPolicy.status(), statusText: "", headers: cachedPolicy.responseHeaders(), body: cached.body };
    }

    let response = await next(cachedPolicy ? withHeaders(request, cachedPolicy.revalidationHeaders(policyRequest)) : request);
    let responseHeaders = Object.fromEntries(response.headers);

    if (cached && cachedPolicy) {
      const { policy, modified, matches } = cachedPolicy.revalidatedPolicy(policyRequest, { status: response.status, headers: responseHeaders });
      if (response.status === 304 && !matches) {
        // A 304 that doesn't match the cached response has no body to use, so
        // the response is retrieved again without revalidating
        await response.body?.cancel();
        response = await next(request);
        responseHeaders = Object.fromEntries(response.headers);
      } else if (!modified) {
        // A revalidated response that wasn't modified only updates the cached
        // response's headers
        await response.body?.cancel();
        await this.#store.set(url, { ...cached, policy: policy.toObject() });
        return { url: cached.url, status: policy.status(), statusText: "", headers: policy.responseHeaders(), body: cached.body };
      }
    }

    // An error doesn't replace what's cached
    if (!cachedStatuses.has(response.status)) {
      return response;
    }

    const body = await response.text();
    const policy = new CachePolicy(policyRequest, { status: response.status, headers: responseHeaders }, { shared: false });
    if (isWorthCaching(policy, responseHeaders)) {
      await this.#store.set(url, { url: response.url, body, policy: policy.toObject() });
    } else if (cached) {
      await this.#store.delete(url);
    }

    return { url: response.url, status: response.status, statusText: response.statusText, headers: responseHeaders, body };
  }
}

/**
 * The HTTP cache layer. It's for `http:` and `https:` responses, because
 * caching headers are HTTP's (RFC 9111), and it's a private cache.
 *
 * @type (cache: HttpCache) => Layer
 */
export const httpCacheLayer = (cache) => (next) => async (request) => {
  return /^https?:/.test(request.url) ? cache.retrieve(request, next) : next(request);
};

/**
 * The request with the headers to revalidate with. It keeps the request's
 * other headers, like its `Referer`, for what's below.
 *
 * @type (request: Request, headers: Record<string, string>) => Request
 */
const withHeaders = (request, headers) => {
  const revalidation = new Headers(request.headers);
  for (const [name, value] of Object.entries(headers)) {
    revalidation.set(name, value);
  }

  return new Request(request.url, { headers: revalidation });
};

/** @type (read: ReadResponse) => Response */
const toResponse = ({ url, status, statusText, headers, body }) => {
  // A string body would get a `Content-Type` if the response doesn't have one
  const response = new Response(new TextEncoder().encode(body), { status, statusText, headers });
  Object.defineProperty(response, "url", { value: url });
  return response;
};

/**
 * A response that's stale as soon as it's stored and can't be revalidated
 * would never be used again.
 *
 * @type (policy: CachePolicy, headers: Record<string, string>) => boolean
 */
const isWorthCaching = (policy, headers) => {
  return policy.storable() && (policy.timeToLive() > 0 || "etag" in headers || "last-modified" in headers);
};
