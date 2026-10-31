import CachePolicy from "http-cache-semantics";
import { toAbsoluteIri } from "@hyperjump/uri";
import { defaultHttpCache } from "#default-http-cache";

/**
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
  #successStatus;

  /** @type HttpCacheStore | undefined */
  #cache;

  /**
   * The `headers` option's entries, from the shortest URL to the longest, so
   * a longer one's headers win when they're merged
   *
   * @type [string, HeadersInit | API.HeadersFunction][]
   */
  #headers;

  /**
   * Responses being retrieved, by URL and Accept header, so concurrent
   * requests for the same URL share one request. A plugin can be in more
   * than one `Hyperjump`, whose media types, and so Accept headers, can
   * differ. Its other headers come from its own options, so they're the
   * same for every request for a URL.
   *
   * @type Map<string, Promise<ReadResponse>>
   */
  #pending;

  /**
   * @param {API.HttpUriSchemePluginOptions} [options]
   */
  constructor(options = {}) {
    this.schemes = ["http", "https"];

    this.#successStatus = new Set([200, 203]);
    this.#cache = options.cache === false ? undefined : options.cache ?? defaultHttpCache();
    this.#headers = resolveHeaders(options.headers ?? {});
    this.#pending = new Map();
  }

  /** @type API.HttpUriSchemePlugin["retrieve"] */
  async retrieve(uri, { accept }) {
    if (!this.#cache) {
      const response = await fetch(uri, { headers: await this.#requestHeaders(uri, accept) });
      await this.#assertSuccess(uri, response);

      return response;
    }

    const url = toAbsoluteIri(uri);
    const key = JSON.stringify([url, accept]);
    let pending = this.#pending.get(key);
    if (!pending) {
      pending = this.#retrieveCached(url, accept, this.#cache).finally(() => {
        this.#pending.delete(key);
      });
      this.#pending.set(key, pending);
    }

    const { body, status, headers, url: responseUrl } = await pending;
    // A string body would get a `Content-Type` if the response doesn't have one
    const response = new Response(new TextEncoder().encode(body), { status, headers });
    Object.defineProperty(response, "url", { value: responseUrl });

    return response;
  }

  /** @type (url: string, accept: string, cache: HttpCacheStore) => Promise<ReadResponse> */
  async #retrieveCached(url, accept, cache) {
    // The cache needs every header sent so it can match a `Vary`
    const request = { url, method: "GET", headers: await this.#requestHeaders(url, accept) };

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

    await this.#assertSuccess(url, response);
    const body = await response.text();

    const policy = new CachePolicy(request, { status: response.status, headers: responseHeaders }, { shared: false });
    if (isWorthCaching(policy, responseHeaders)) {
      await cache.set(url, { url: response.url, body, policy: policy.toObject() });
    } else if (cached) {
      await cache.delete(url);
    }

    return { url: response.url, status: response.status, headers: responseHeaders, body };
  }

  /**
   * A HeadersFunction is called with the URL that's requested, without its
   * fragment, which isn't part of a request. It's a copy for each function,
   * so one that changes it doesn't change what the next one sees.
   *
   * @type (uri: string, accept: string) => Promise<Record<string, string>>
   */
  async #requestHeaders(uri, accept) {
    const url = new URL(uri);
    url.hash = "";

    const headers = new Headers();
    for (const [entry, value] of this.#headers) {
      if (entry.endsWith("/") ? url.href.startsWith(entry) : url.href === entry) {
        const entryHeaders = new Headers(typeof value === "function" ? await value(new URL(url)) : value);
        for (const [name, headerValue] of entryHeaders) {
          headers.set(name, headerValue);
        }
      }
    }
    headers.set("accept", accept);

    return Object.fromEntries(headers);
  }

  /**
   * A response that isn't used has its body cancelled, so its connection is
   * released
   *
   * @type (uri: string, response: Response) => Promise<void>
   */
  async #assertSuccess(uri, response) {
    try {
      this.#assertUsable(uri, response);
    } catch (error) {
      await response.body?.cancel();
      throw error;
    }
  }

  /** @type (uri: string, response: Response) => void */
  #assertUsable(uri, response) {
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
 * Check the `headers` option's URLs and sort its entries from the shortest
 * URL to the longest. A URL is compared after it's parsed, like an
 * `allowRetrieval` entry, and its fragment is ignored. One that isn't an
 * absolute `http(s):` URL would never match, so it throws.
 *
 * @type (headers: unknown) => [string, HeadersInit | API.HeadersFunction][]
 */
const resolveHeaders = (headers) => {
  if (typeof headers !== "object" || headers === null || Array.isArray(headers)) {
    throw TypeError("The 'headers' option must be an object of headers by URL");
  }

  return Object.entries(headers)
    .map(([entry, value]) => {
      let url;
      try {
        url = new URL(entry);
      } catch {
        throw Error(`'${entry}' in the 'headers' option isn't an absolute URL`);
      }

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw Error(`'${entry}' in the 'headers' option isn't an 'http:' or 'https:' URL`);
      }

      url.hash = "";
      return /** @type [string, HeadersInit | API.HeadersFunction] */ ([url.href, value]);
    })
    .sort(([a], [b]) => a.length - b.length);
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
