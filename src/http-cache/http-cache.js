import { MemoryCacheStore } from "./memory-cache-store.js";
import { parseCacheControl, varyMatches } from "./cache-control.js";
import { networkError, responseMeta, setResponseMeta, withUrl } from "../response-meta.js";
import { nullBodyStatuses } from "../statuses.js";

/**
 * @import * as API from "./http-cache.d.ts"
 * @import { FetchContext, Fetcher } from "../layers.d.ts"
 * @import { CacheMode } from "../hyperjump.d.ts"
 * @import { ResponseMeta } from "../response-meta.d.ts"
 */

/** @typedef {{ response: Response, requestTime: number, responseTime: number }} Timed */

/** The statuses RFC 9111 lets a cache give a lifetime to when a response doesn't say one */
const heuristicallyCacheable = new Set([200, 203, 204, 206, 300, 301, 308, 404, 405, 410, 414, 501]);

const httpSchemes = new Set(["http:", "https:"]);

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** A request with one of these is already conditional, so the Fetch standard bypasses the cache */
const conditionalHeaders = ["if-modified-since", "if-none-match", "if-unmodified-since", "if-match", "if-range"];

/** Headers a 304 doesn't change in a stored response */
const notUpdatedBy304 = new Set(["content-length", "content-encoding", "transfer-encoding", "content-range"]);

/** Headers about one connection, not the response (RFC 9110 §7.6.1), which a cache doesn't store */
const hopByHopHeaders = ["connection", "keep-alive", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"];

/**
 * The default `maxBodySize`: 16 MB, many times the biggest schemas, and big
 * enough for a large API's description. A cache in memory that kept bodies
 * of any size could be made to keep them without end.
 */
const MAX_BODY_SIZE = 16 * 1024 * 1024;

/** @implements API.HttpCache */
export class HttpCache {
  /** @type number */
  #heuristicFraction;

  /** @type number */
  #permanentRedirectLifetime;

  /** @type API.HttpCacheOptions["heuristic"] */
  #heuristic;

  /** @type number */
  #maxBodySize;

  /** @type () => number */
  #now;

  /** @type NonNullable<API.HttpCacheOptions["onStoreError"]> */
  #onStoreError;

  /**
   * The stored responses being refreshed in the background, by `variantKey`,
   * so a stale response that's served again while it's refreshed isn't
   * refreshed again
   *
   * @type Set<string>
   */
  #refreshing = new Set();

  /**
   * @param {Fetcher} inner
   * @param {API.HttpCacheOptions} [options]
   */
  constructor(inner, options = {}) {
    this.inner = inner;
    /** @type API.CacheStore */
    this.store = options.store ?? new MemoryCacheStore();
    this.shared = options.shared ?? false;
    this.#heuristicFraction = options.heuristicFraction ?? 0.1;
    this.#permanentRedirectLifetime = options.permanentRedirectLifetime ?? 86_400;
    this.#heuristic = options.heuristic;
    this.#maxBodySize = options.maxBodySize ?? MAX_BODY_SIZE;
    this.#now = options.now ?? Date.now;
    this.#onStoreError = options.onStoreError ?? (() => {});
  }

  /** @type API.HttpCache["purge"] */
  async purge(url) {
    await this.#storeDelete(cacheKey(String(url)));
  }

  /** @type API.HttpCache["fetch"] */
  async fetch(request, ctx) {
    // Only HTTP has caching. A file is read each time, and it's always
    // current.
    if (!httpSchemes.has(new URL(request.url).protocol)) {
      return markCache(await this.inner.fetch(request, ctx), "bypass");
    }

    const method = request.method;
    if (method !== "GET" && method !== "HEAD") {
      const response = await this.inner.fetch(request, ctx);
      if (unsafeMethods.has(method) && response.status < 400) {
        await this.#invalidate(request, response);
      }
      return response;
    }

    let mode = effectiveMode(request, ctx.cacheMode);
    if (mode === "no-store") {
      return markCache(await this.inner.fetch(request, ctx), "bypass");
    }
    if (mode === "reload") {
      return this.#storeAndReturn(request, await this.#fetchTimed(request, ctx));
    }

    const requestCacheControl = parseCacheControl(request.headers.get("cache-control"));
    if ((requestCacheControl.has("no-cache") || request.headers.get("pragma") === "no-cache") && mode === "default") {
      mode = "no-cache";
    }

    const entry = await this.#lookup(request);
    if (!entry) {
      if (mode === "only-if-cached") {
        throw networkError(`'${request.url}' isn't in the cache, and its cache mode is "only-if-cached"`, { code: "ERR_CACHE_MISS" }, request.url);
      }
      if (method === "HEAD") {
        return markCache(await this.inner.fetch(request, ctx), "miss");
      }
      return this.#storeAndReturn(request, await this.#fetchTimed(request, ctx));
    }

    if (mode === "force-cache" || mode === "only-if-cached") {
      return this.#serve(entry, request, "hit");
    }

    const { fresh, staleBy, age, staleWhileRevalidate } = this.#freshness(entry, requestCacheControl);
    const responseCacheControl = parseCacheControl(header(entry, "cache-control"));
    const mustRevalidate = mode === "no-cache" || responseCacheControl.has("no-cache");

    if (!mustRevalidate) {
      if (fresh) {
        return this.#serve(entry, request, "hit");
      }

      // `s-maxage` has `proxy-revalidate`'s meaning in a shared cache (RFC
      // 9111 §5.2.2.10), so neither lets one serve it stale
      const staleAllowed = !responseCacheControl.has("must-revalidate")
        && !(this.shared && (responseCacheControl.has("proxy-revalidate") || responseCacheControl.has("s-maxage")));
      const maxStale = requestCacheControl.get("max-stale");
      if (staleAllowed && maxStale !== undefined && (maxStale === "" || staleBy <= Number(maxStale))) {
        return this.#serve(entry, request, "stale");
      }
      // `stale-while-revalidate` is the origin allowing a stale response, but
      // a request with `max-age` or `min-fresh` and without `max-stale`
      // doesn't want one (RFC 9111 §5.2.1), even if it's only too old for
      // the request and not past its own lifetime
      const wantsFresh = requestCacheControl.has("max-age") || requestCacheControl.has("min-fresh");
      if (staleAllowed && !wantsFresh && staleWhileRevalidate !== undefined && staleBy <= staleWhileRevalidate) {
        this.#refresh(entry, request, ctx);
        return this.#serve(entry, request, "stale", age);
      }
    }

    return this.#revalidate(entry, request, ctx);
  }

  /**
   * Refresh a stale response in the background, unless it's being refreshed
   * already. The refresh is a request of the session's, with its own record,
   * so it isn't this one's, which ends now, and the caller aborting doesn't
   * stop it. It goes down the stack again, to this cache, which revalidates
   * it for `no-cache`. Nobody is waiting for it, so it's low priority, and it
   * refreshes this response, even a redirect.
   *
   * @type (entry: API.CachedEntry, request: Request, ctx: FetchContext) => void
   */
  #refresh(entry, request, ctx) {
    const key = variantKey(entry);
    if (this.#refreshing.has(key)) {
      return;
    }

    this.#refreshing.add(key);
    ctx.record.mark("cache:background-revalidate");
    ctx.session.fetch(request.url, {
      method: request.method,
      headers: request.headers,
      cache: "no-cache",
      priority: "low",
      redirect: "manual",
      initiator: ctx.record
    })
      .then((response) => response.body?.cancel(), () => {})
      .finally(() => {
        this.#refreshing.delete(key);
      });
  }

  /** @type (request: Request) => Promise<API.CachedEntry | undefined> */
  async #lookup(request) {
    const url = cacheKey(request.url);
    try {
      const variants = await this.store.match(url);
      return variants.find((variant) => varyMatches(variant, request.headers));
    } catch (error) {
      this.#onStoreError(error, "match", url);
      return undefined;
    }
  }

  /** @type (entry: API.CachedEntry) => Promise<void> */
  async #storePut(entry) {
    try {
      await this.store.put(entry);
    } catch (error) {
      this.#onStoreError(error, "put", entry.url);
    }
  }

  /** @type (url: string) => Promise<void> */
  async #storeDelete(url) {
    try {
      await this.store.delete(url);
    } catch (error) {
      this.#onStoreError(error, "delete", url);
    }
  }

  /** @type (request: Request, ctx: FetchContext) => Promise<Timed> */
  async #fetchTimed(request, ctx) {
    const requestTime = this.#now();
    const response = await this.inner.fetch(request, ctx);
    return { response, requestTime, responseTime: this.#now() };
  }

  /** @type (entry: API.CachedEntry, request: Request, ctx: FetchContext) => Promise<Response> */
  async #revalidate(entry, request, ctx) {
    if (request.method === "HEAD") {
      // A HEAD can't refresh a stored response, so it's passed on
      return markCache(await this.inner.fetch(request, ctx), "miss");
    }

    const etag = header(entry, "etag");
    const lastModified = header(entry, "last-modified");
    ctx.record.mark("cache:revalidate", { etag, lastModified });
    const conditional = new Request(request);
    if (etag) {
      conditional.headers.set("if-none-match", etag);
    } else if (lastModified) {
      conditional.headers.set("if-modified-since", lastModified);
    }

    const timed = await this.#fetchTimed(conditional, ctx);
    if (timed.response.status === 304 && (etag || lastModified)) {
      const updated = mergeNotModified(entry, timed, request);
      await this.#storePut(updated);
      return this.#serve(updated, request, "revalidated");
    }
    return this.#storeAndReturn(request, timed);
  }

  /**
   * Store a response if it can be, while the caller reads it. A clone is
   * read for the store, so the caller's body streams.
   *
   * @type (request: Request, timed: Timed) => Promise<Response>
   */
  async #storeAndReturn(request, timed) {
    const { response } = timed;
    markCache(response, "miss");
    if (!this.#isStorable(request, response)) {
      return response;
    }
    // A body that says it's too big isn't read. One that doesn't say, or
    // whose decoded body is bigger than it says, is found out as it's read.
    if (Number(response.headers.get("content-length") ?? NaN) > this.#maxBodySize) {
      return response;
    }

    readUpTo(response.clone().body, this.#maxBodySize)
      .then(async (body) => {
        if (body) {
          await this.#storePut(this.#fullEntry(request, timed, body));
        }
      }, () => {
        // A body that failed or was aborted isn't stored
      });
    return response;
  }

  /**
   * A stored response, from a response and its body. Runtimes give a decoded
   * body, so its `Content-Encoding` is dropped and its length is the decoded
   * length.
   *
   * @type (request: Request, timed: Timed, body: Uint8Array) => API.CachedEntry
   */
  #fullEntry(request, { response, requestTime, responseTime }, body) {
    const headers = withoutHopByHop(response.headers);
    headers.delete("content-encoding");
    headers.set("content-length", String(body.byteLength));
    return {
      url: cacheKey(request.url),
      status: response.status,
      statusText: response.statusText,
      headers: [...headers],
      body,
      requestHeaders: variedHeaders(request.headers, headers),
      requestTime,
      responseTime
    };
  }

  /** @type (request: Request, response: Response) => boolean */
  #isStorable(request, response) {
    const shared = this.shared;
    if (request.method !== "GET") {
      return false;
    }
    // A 206 is part of a representation, and the cache only stores whole ones
    if (response.status < 200 || response.status === 304 || response.status === 206) {
      return false;
    }

    const requestCacheControl = parseCacheControl(request.headers.get("cache-control"));
    const cacheControl = parseCacheControl(response.headers.get("cache-control"));
    if (requestCacheControl.has("no-store") || cacheControl.has("no-store")) {
      return false;
    }
    if (shared && cacheControl.has("private")) {
      return false;
    }
    if (shared && request.headers.has("authorization") && !(cacheControl.has("public") || cacheControl.has("s-maxage") || cacheControl.has("must-revalidate"))) {
      return false;
    }
    if (response.headers.get("vary")?.trim() === "*") {
      return false;
    }
    return cacheControl.has("max-age")
      || (shared && cacheControl.has("s-maxage"))
      || cacheControl.has("public")
      || (!shared && cacheControl.has("private"))
      || response.headers.has("expires")
      || heuristicallyCacheable.has(response.status);
  }

  /**
   * A stored response's lifetime and age, in seconds (RFC 9111 §4.2)
   *
   * @type (entry: API.CachedEntry, requestCacheControl: Map<string, string>) => { fresh: boolean, staleBy: number, age: number, staleWhileRevalidate: number | undefined }
   */
  #freshness(entry, requestCacheControl) {
    const cacheControl = parseCacheControl(header(entry, "cache-control"));
    const date = parseDate(header(entry, "date")) ?? entry.responseTime;
    const sMaxAge = cacheControl.get("s-maxage");
    const maxAge = cacheControl.get("max-age");
    const expires = header(entry, "expires");

    let lifetime = 0;
    if (this.shared && sMaxAge !== undefined) {
      lifetime = seconds(sMaxAge);
    } else if (maxAge !== undefined) {
      lifetime = seconds(maxAge);
    } else if (expires !== undefined) {
      lifetime = Math.max(0, ((parseDate(expires) ?? 0) - date) / 1000);
    } else if (heuristicallyCacheable.has(entry.status)) {
      lifetime = this.#heuristicLifetime(entry, date);
    }

    const apparentAge = Math.max(0, entry.responseTime - date) / 1000;
    const responseDelay = (entry.responseTime - entry.requestTime) / 1000;
    const correctedAge = seconds(header(entry, "age") ?? "0") + responseDelay;
    const age = Math.max(apparentAge, correctedAge) + (this.#now() - entry.responseTime) / 1000;

    let limit = lifetime;
    const requestMaxAge = requestCacheControl.get("max-age");
    if (requestMaxAge !== undefined) {
      limit = Math.min(limit, seconds(requestMaxAge));
    }
    const minFresh = seconds(requestCacheControl.get("min-fresh") ?? "0");
    const staleWhileRevalidate = cacheControl.get("stale-while-revalidate");

    return {
      fresh: age + minFresh < limit,
      staleBy: age - limit,
      age,
      staleWhileRevalidate: staleWhileRevalidate === undefined ? undefined : seconds(staleWhileRevalidate)
    };
  }

  /**
   * A lifetime for a response that doesn't say one (RFC 9111 §4.2.2): the
   * application's heuristic, then a permanent redirect's, then a part of the
   * time since `Last-Modified`
   *
   * @type (entry: API.CachedEntry, date: number) => number
   */
  #heuristicLifetime(entry, date) {
    const custom = this.#heuristic?.({ url: entry.url, status: entry.status, headers: new Headers(entry.headers) });
    if (custom !== undefined) {
      return Math.max(0, custom);
    }
    if ((entry.status === 301 || entry.status === 308) && this.#permanentRedirectLifetime > 0) {
      return this.#permanentRedirectLifetime;
    }
    const lastModified = parseDate(header(entry, "last-modified"));
    if (lastModified !== undefined) {
      return Math.max(0, (date - lastModified) / 1000 * this.#heuristicFraction);
    }
    return 0;
  }

  /** @type (entry: API.CachedEntry, request: Request, status: "hit" | "stale" | "revalidated", age?: number) => Response */
  #serve(entry, request, status, age) {
    const headers = new Headers(entry.headers);
    headers.set("age", String(Math.floor(Math.max(0, age ?? this.#freshness(entry, new Map()).age))));
    const body = request.method === "HEAD" || nullBodyStatuses.has(entry.status) ? null : entry.body.slice();
    const response = new Response(body, { status: entry.status, statusText: entry.statusText, headers });
    return setResponseMeta(withUrl(response, entry.url), { source: "http-cache", cache: status });
  }

  /**
   * A successful unsafe request makes what's stored for its URL stale, and
   * for its `Location` and `Content-Location` on the same origin
   *
   * @type (request: Request, response: Response) => Promise<void>
   */
  async #invalidate(request, response) {
    const base = new URL(request.url);
    for (const target of [request.url, response.headers.get("location"), response.headers.get("content-location")]) {
      if (target) {
        const url = new URL(target, base);
        if (url.origin === base.origin) {
          await this.#storeDelete(cacheKey(url.href));
        }
      }
    }
  }
}

/** @type typeof API.httpCache */
export const httpCache = (options) => (inner) => new HttpCache(inner, options);

/**
 * The cache mode a request is handled with. As in the Fetch standard, a
 * request that's already conditional bypasses the cache.
 *
 * @type (request: Request, mode: CacheMode) => CacheMode
 */
const effectiveMode = (request, mode) => {
  if (mode === "default" && conditionalHeaders.some((name) => request.headers.has(name))) {
    return "no-store";
  }
  // The cache doesn't answer ranges, so a range is the server's to answer.
  // With `only-if-cached`, nothing can be sent, and a stored response is an
  // answer to a range, because a server can ignore one.
  if (request.headers.has("range") && mode !== "only-if-cached") {
    return "no-store";
  }
  if (parseCacheControl(request.headers.get("cache-control")).has("no-store")) {
    return "no-store";
  }
  return mode;
};

/**
 * What identifies a stored response: its URL and the request headers its
 * `Vary` names, which are all that's stored of its request
 *
 * @type (entry: API.CachedEntry) => string
 */
const variantKey = (entry) => JSON.stringify([entry.url, entry.requestHeaders]);

/** @type (url: string) => string */
const cacheKey = (url) => {
  const key = new URL(url);
  key.hash = "";
  return key.href;
};

/** @type (entry: API.CachedEntry, name: string) => string | undefined */
const header = (entry, name) => entry.headers.find(([key]) => key.toLowerCase() === name)?.[1];

/** @type (entry: API.CachedEntry, timed: Timed, request: Request) => API.CachedEntry */
const mergeNotModified = (entry, { response, requestTime, responseTime }, request) => {
  const headers = new Headers(entry.headers);
  for (const [name, value] of withoutHopByHop(response.headers)) {
    if (!notUpdatedBy304.has(name)) {
      headers.set(name, value);
    }
  }
  response.body?.cancel().catch(() => {});
  return { ...entry, headers: [...headers], requestHeaders: variedHeaders(request.headers, headers), requestTime, responseTime };
};

/**
 * The request headers a response's `Vary` names, which is all that's
 * compared to choose it (`varyMatches`). Only those are stored, so a
 * credential the response doesn't vary by isn't kept with it, in memory or
 * on disk. A 304 can change `Vary`, so a response it updates takes them
 * from the request that revalidated it, which matched the stored ones.
 *
 * @type (requestHeaders: Headers, responseHeaders: Headers) => [string, string][]
 */
const variedHeaders = (requestHeaders, responseHeaders) => (responseHeaders.get("vary") ?? "").split(",")
  .map((name) => name.trim().toLowerCase())
  .filter((name) => name !== "" && requestHeaders.has(name))
  .map((name) => [name, /** @type string */ (requestHeaders.get(name))]);

/** @type (source: Headers) => Headers */
const withoutHopByHop = (source) => {
  const headers = new Headers(source);
  const listed = (source.get("connection") ?? "").split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  for (const name of [...hopByHopHeaders, ...listed]) {
    headers.delete(name);
  }
  return headers;
};

/** @type (value: string) => number */
const seconds = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

/** @type (value: string | undefined) => number | undefined */
const parseDate = (value) => {
  if (!value) {
    return undefined;
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : time;
};

/** @type (response: Response, cache: NonNullable<ResponseMeta["cache"]>) => Response */
const markCache = (response, cache) => {
  if (!responseMeta(response).cache) {
    setResponseMeta(response, { cache });
  }
  return response;
};

/**
 * A body's bytes, unless there are more than `max`, which stops reading it
 * and cancels it as soon as they're more. A body's `Content-Length` can be
 * missing, or be the length of the compressed body, so only what's read
 * says how big it is.
 *
 * @type (body: ReadableStream<Uint8Array> | null, max: number) => Promise<Uint8Array | undefined>
 */
const readUpTo = async (body, max) => {
  if (body === null) {
    return new Uint8Array(0);
  }

  const reader = body.getReader();
  /** @type Uint8Array[] */
  const chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    length += value.byteLength;
    if (length > max) {
      await reader.cancel();
      return;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};
