import CachePolicy from "http-cache-semantics";
import { toAbsoluteIri } from "@hyperjump/uri";
import { defaultHttpCache } from "#default-http-cache";
import { redirectMode } from "#redirect-mode";

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

const successStatuses = new Set([200, 203]);
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

/** @implements API.HttpUriSchemePlugin */
export class HttpUriSchemePlugin {
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
   * The `mediaTypeByExtension` option's URLs, for servers that send the wrong
   * `Content-Type`
   *
   * @type string[]
   */
  #extensionUrls;

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

    this.#cache = options.cache === false ? undefined : options.cache ?? defaultHttpCache();
    this.#headers = resolveHeaders(options.headers ?? {});
    this.#extensionUrls = (options.mediaTypeByExtension ?? []).map((entry) => resolveEntry(entry, "mediaTypeByExtension"));
    this.#pending = new Map();
  }

  /** @type API.HttpUriSchemePlugin["retrieve"] */
  async retrieve(uri, { accept, mediaTypeByExtension }) {
    if (!this.#cache) {
      const response = await fetch(uri, { headers: await this.#requestHeaders(uri, accept), redirect: redirectMode });
      await assertUsable(uri, response);
      if (redirectStatuses.has(response.status)) {
        return response;
      }

      const mediaType = this.#extensionMediaType(response.url || uri, mediaTypeByExtension);
      if (mediaType === undefined) {
        return response;
      }

      // A response from `fetch` can't have its headers changed. Its status is
      // a success, which the constructor accepts.
      const headers = new Headers(response.headers);
      headers.set("content-type", mediaType);
      const typedResponse = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      Object.defineProperty(typedResponse, "url", { value: response.url || toAbsoluteIri(uri) });

      return typedResponse;
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
    // The cache has the `Content-Type` the server sent, so changing the option
    // doesn't need the cache cleared
    const mediaType = this.#extensionMediaType(responseUrl, mediaTypeByExtension);
    const responseHeaders = mediaType === undefined ? headers : { ...headers, "content-type": mediaType };
    // A string body would get a `Content-Type` if the response doesn't have one
    const response = new Response(new TextEncoder().encode(body), { status, headers: responseHeaders });
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
      headers: cachedPolicy ? cachedPolicy.revalidationHeaders(request) : request.headers,
      redirect: redirectMode
    });
    let responseHeaders = Object.fromEntries(response.headers);

    if (cached && cachedPolicy) {
      const { policy, modified, matches } = cachedPolicy.revalidatedPolicy(request, { status: response.status, headers: responseHeaders });
      if (response.status === 304 && !matches) {
        // A 304 that doesn't match the cached response has no body to use, so
        // the response is retrieved again without revalidating
        response = await fetch(url, { headers: request.headers, redirect: redirectMode });
        responseHeaders = Object.fromEntries(response.headers);
      } else if (!modified) {
        // A revalidated response that wasn't modified only updates the cached
        // response's headers
        await cache.set(url, { ...cached, policy: policy.toObject() });
        return { url: cached.url, status: policy.status(), headers: policy.responseHeaders(), body: cached.body };
      }
    }

    await assertUsable(url, response);
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
      if (matches(entry, url.href)) {
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
   * The media type of a response's URL's extension, if the URL is one the
   * `mediaTypeByExtension` option lists and a media type plugin has the
   * extension. It's matched by the URL the response came from, because that's
   * the server that sends the wrong type. The extension is the path's, without
   * the query, which a URL like a private GitHub raw URL has.
   *
   * @type (responseUrl: string, mediaTypeByExtension: (uri: string) => string | undefined) => string | undefined
   */
  #extensionMediaType(responseUrl, mediaTypeByExtension) {
    const url = new URL(responseUrl);
    url.hash = "";
    if (!this.#extensionUrls.some((entry) => matches(entry, url.href))) {
      return undefined;
    }

    url.search = "";
    return mediaTypeByExtension(url.href);
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
 * URL to the longest
 *
 * @type (headers: Record<string, HeadersInit | API.HeadersFunction>) => [string, HeadersInit | API.HeadersFunction][]
 */
const resolveHeaders = (headers) => {
  return Object.entries(headers)
    .map(([entry, value]) => /** @type [string, HeadersInit | API.HeadersFunction] */ ([resolveEntry(entry, "headers"), value]))
    .sort(([a], [b]) => a.length - b.length);
};

/**
 * An option's URL is compared after it's parsed, like an `allowRetrieval`
 * entry, and its fragment is ignored. One that isn't an absolute `http(s):`
 * URL would never match, so it throws.
 *
 * @type (entry: string, option: string) => string
 */
const resolveEntry = (entry, option) => {
  let url;
  try {
    url = new URL(entry);
  } catch {
    throw Error(`'${entry}' in the '${option}' option isn't an absolute URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw Error(`'${entry}' in the '${option}' option isn't an 'http:' or 'https:' URL`);
  }

  url.hash = "";
  return url.href;
};

/**
 * An option's URL that ends with `/` is for everything under it, and any
 * other is only for itself
 *
 * @type (entry: string, href: string) => boolean
 */
const matches = (entry, href) => entry.endsWith("/") ? href.startsWith(entry) : href === entry;

/**
 * A success, or a redirect for the session to follow. A redirect has to
 * have a `Location`, and it can only lead to another `http(s):` URL, like
 * a redirect `fetch` follows, so a server can't send the session to a
 * file. A response that isn't used has its body cancelled, so its
 * connection is released.
 *
 * @type (uri: string, response: Response) => Promise<void>
 */
const assertUsable = async (uri, response) => {
  if (successStatuses.has(response.status)) {
    return;
  }

  if (redirectStatuses.has(response.status)) {
    const location = response.headers.get("location");
    if (location !== null && isHttpUrl(location, response.url || uri)) {
      return;
    }

    await response.body?.cancel();
    throw new HttpError(response, location === null ? "A redirect without a 'Location'" : `A redirect to '${location}', which isn't an 'http:' or 'https:' URL`);
  }

  await response.body?.cancel();
  throw new HttpError(response, response.status >= 400 ? `Failed to retrieve '${uri}'` : "Unsupported HTTP response status code");
};

/** @type (location: string, base: string) => boolean */
const isHttpUrl = (location, base) => {
  const url = URL.parse(location, base);
  return url?.protocol === "http:" || url?.protocol === "https:";
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
