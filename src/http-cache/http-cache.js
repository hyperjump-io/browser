import { MemoryCacheStore } from "./memory-cache-store.js";
import { parseCacheControl, varyMatches } from "./cache-control.js";
import { networkError, responseMeta, setResponseMeta, withUrl } from "../response-meta.js";
import { PrioritySignal } from "../priority.js";
import { nullBodyStatuses } from "../statuses.js";
import { addSegment, isComplete, missingRanges, parseContentRange, parseRange, resolveRange, sliceSegments } from "./ranges.js";

/**
 * @import * as API from "./http-cache.d.ts"
 * @import { FetchContext, Fetcher } from "../layers.d.ts"
 * @import { CacheMode } from "../session.d.ts"
 * @import { ResponseMeta } from "../response-meta.d.ts"
 * @import { RangeSpec, Segments } from "./ranges.js"
 */

/** @typedef {{ response: Response, requestTime: number, responseTime: number }} Timed */

/** The statuses RFC 9111 lets a cache give a lifetime to when a response doesn't say one */
const heuristicallyCacheable = new Set([200, 203, 204, 206, 300, 301, 308, 404, 405, 410, 414, 501]);

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** A request with one of these is already conditional, so the Fetch standard bypasses the cache */
const conditionalHeaders = ["if-modified-since", "if-none-match", "if-unmodified-since", "if-match", "if-range"];

/** Headers a 304 doesn't change in a stored response */
const notUpdatedBy304 = new Set(["content-length", "content-encoding", "transfer-encoding", "content-range"]);

/** Headers about one connection, not the response (RFC 9110 §7.6.1), which a cache doesn't store */
const hopByHopHeaders = ["connection", "keep-alive", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"];

/** @implements API.HttpCache */
export class HttpCache {
  /** @type number */
  #heuristicFraction;

  /** @type number */
  #permanentRedirectLifetime;

  /** @type API.HttpCacheOptions["heuristic"] */
  #heuristic;

  /** @type number | undefined */
  #maxBodySize;

  /** @type () => number */
  #now;

  /** @type NonNullable<API.HttpCacheOptions["onStoreError"]> */
  #onStoreError;

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
    this.#maxBodySize = options.maxBodySize;
    this.#now = options.now ?? Date.now;
    this.#onStoreError = options.onStoreError ?? (() => {});
  }

  /** @type API.HttpCache["purge"] */
  async purge(url) {
    await this.#storeDelete(cacheKey(String(url)));
  }

  /** @type API.HttpCache["fetch"] */
  async fetch(request, ctx) {
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

    if (method === "GET" && request.headers.has("range")) {
      return this.#fetchRange(request, ctx, mode, requestCacheControl);
    }

    const found = await this.#lookup(request);
    // Parts of a representation can't answer a request for all of it
    const entry = found?.partial ? undefined : found;
    if (!entry) {
      if (mode === "only-if-cached") {
        throw networkError(`'${request.url}' isn't in the cache, and its cache mode is "only-if-cached"`, { code: "ERR_CACHE_MISS" });
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

      const staleAllowed = !responseCacheControl.has("must-revalidate") && !(this.shared && responseCacheControl.has("proxy-revalidate"));
      const maxStale = requestCacheControl.get("max-stale");
      if (staleAllowed && maxStale !== undefined && (maxStale === "" || staleBy <= Number(maxStale))) {
        return this.#serve(entry, request, "stale");
      }
      if (staleAllowed && staleWhileRevalidate !== undefined && staleBy <= staleWhileRevalidate) {
        // The refresh belongs to the session, not to this request, and nobody
        // is waiting for it, so it's low priority
        ctx.record.mark("cache:background-revalidate");
        const backgroundCtx = { ...ctx, signal: ctx.session.signal, priority: PrioritySignal.of("low") };
        this.#revalidate(entry, new Request(request, { signal: ctx.session.signal }), backgroundCtx)
          .then((response) => response.body?.cancel(), () => {});
        return this.#serve(entry, request, "stale", age);
      }
    }

    return this.#revalidate(entry, request, ctx);
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
      const updated = mergeNotModified(entry, timed);
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
    const max = this.#maxBodySize;
    if (max !== undefined && Number(response.headers.get("content-length") ?? NaN) > max) {
      return response;
    }

    response.clone().arrayBuffer()
      .then(async (buffer) => {
        if (max === undefined || buffer.byteLength <= max) {
          await this.#storePut(this.#fullEntry(request, timed, new Uint8Array(buffer)));
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
      requestHeaders: requestHeadersOf(request),
      requestTime,
      responseTime
    };
  }

  /**
   * A `GET` with one byte range. It's answered from what's stored when that
   * has the range, whether it's a whole copy or parts. Otherwise it's sent,
   * and a 206 is stored and joined to the parts already stored.
   *
   * @type (request: Request, ctx: FetchContext, mode: CacheMode, requestCacheControl: Map<string, string>) => Promise<Response>
   */
  async #fetchRange(request, ctx, mode, requestCacheControl) {
    const spec = parseRange(request.headers.get("range"));
    if (!spec) {
      // Several ranges, or one that doesn't parse
      return markCache(await this.inner.fetch(request, ctx), "bypass");
    }

    const entry = mode === "reload" ? undefined : await this.#lookup(request);
    if (entry) {
      const forced = mode === "force-cache" || mode === "only-if-cached";
      const responseCacheControl = parseCacheControl(header(entry, "cache-control"));
      const usable = forced || (mode !== "no-cache" && !responseCacheControl.has("no-cache") && this.#freshness(entry, requestCacheControl).fresh);
      const served = usable ? this.#serveRange(entry, spec) : undefined;
      if (served) {
        return served;
      }
    }
    if (mode === "only-if-cached") {
      throw networkError(`'${request.url}' (${request.headers.get("range")}) isn't in the cache, and its cache mode is "only-if-cached"`, { code: "ERR_CACHE_MISS" });
    }

    // If-Range checks the stored parts, so they can be used even when stale
    if (entry?.partial) {
      const filled = await this.#fillGaps(request, ctx, entry, spec);
      if (filled) {
        return filled;
      }
    }

    const timed = await this.#fetchTimed(request, ctx);
    if (timed.response.status === 206) {
      return this.#storePartial(request, timed, entry);
    } else if (timed.response.status === 200) {
      // The server sent all of it
      return this.#storeAndReturn(request, timed);
    } else {
      return markCache(timed.response, "miss");
    }
  }

  /**
   * A 206, or a 416 for a range past the end, from what's stored, or
   * `undefined` if it doesn't have the range
   *
   * @type (entry: API.CachedEntry, spec: RangeSpec) => Response | undefined
   */
  #serveRange(entry, spec) {
    /** @type Segments */
    const stored = entry.partial
      ? { segments: entry.partial.segments, body: entry.body }
      : { segments: [{ start: 0, length: entry.body.byteLength }], body: entry.body };
    const length = entry.partial ? entry.partial.length : entry.body.byteLength;
    const range = resolveRange(spec, length);
    if (range === undefined) {
      return undefined;
    }

    const headers = new Headers(entry.headers);
    headers.set("age", String(Math.floor(Math.max(0, this.#freshness(entry, new Map()).age))));
    let response;
    if (range === "unsatisfiable") {
      headers.set("content-range", `bytes */${length}`);
      headers.set("content-length", "0");
      response = new Response(null, { status: 416, statusText: "Range Not Satisfiable", headers });
    } else {
      const bytes = sliceSegments(stored, range.start, range.end);
      if (!bytes) {
        return undefined;
      }
      headers.set("content-range", `bytes ${range.start}-${range.end}/${length ?? "*"}`);
      headers.set("content-length", String(bytes.byteLength));
      response = new Response(bytes, { status: 206, statusText: "Partial Content", headers });
    }
    return setResponseMeta(withUrl(response, entry.url), { source: "http-cache", cache: "hit" });
  }

  /**
   * Store a 206 while the caller reads it
   *
   * @type (request: Request, timed: Timed, existing: API.CachedEntry | undefined) => Response
   */
  #storePartial(request, timed, existing) {
    const { response } = timed;
    markCache(response, "miss");
    if (!parseContentRange(response.headers.get("content-range")) || !this.#isStorable(request, response, true)) {
      return response;
    }

    response.clone().arrayBuffer()
      .then(async (buffer) => {
        const merged = this.#mergePartial(request, timed, existing, new Uint8Array(buffer));
        if (merged) {
          await this.#storePut(merged);
        }
      }, () => {
        // A body that failed or was aborted isn't stored
      });
    return response;
  }

  /**
   * What's stored once a 206's bytes are added. RFC 9111 §3.4 only lets a
   * cache join parts that have the same strong validator, so they're joined
   * only when their strong `ETag`s and lengths match, and otherwise the new
   * part replaces what's stored. It's `undefined` when the response can't be
   * used, or what's stored is already whole.
   *
   * @type (request: Request, timed: Timed, existing: API.CachedEntry | undefined, bytes: Uint8Array) => API.CachedEntry | undefined
   */
  #mergePartial(request, { response, requestTime, responseTime }, existing, bytes) {
    const range = parseContentRange(response.headers.get("content-range"));
    if (!range || bytes.byteLength !== range.end - range.start + 1) {
      return undefined;
    }
    const etag = response.headers.get("etag");
    const strong = etag !== null && !etag.startsWith("W/");

    /** @type Segments */
    let base = { segments: [], body: new Uint8Array(0) };
    let length = range.length;
    const sameRepresentation = existing !== undefined
      && strong
      && header(existing, "etag") === etag
      && (existing.partial?.length ?? existing.body.byteLength) === (length ?? existing.partial?.length);
    if (existing && sameRepresentation) {
      if (!existing.partial) {
        return undefined;
      }
      base = { segments: existing.partial.segments, body: existing.body };
      length ??= existing.partial.length;
    }
    const merged = addSegment(base, range.start, bytes);
    if (this.#maxBodySize !== undefined && merged.body.byteLength > this.#maxBodySize) {
      return undefined;
    }

    const headers = withoutHopByHop(response.headers);
    headers.delete("content-range");
    headers.delete("content-encoding");
    const complete = isComplete(merged, length);
    if (complete) {
      headers.set("content-length", String(length));
    } else {
      headers.delete("content-length");
    }
    return {
      url: cacheKey(request.url),
      status: 200,
      statusText: "OK",
      headers: [...headers],
      body: merged.body,
      requestHeaders: requestHeadersOf(request),
      requestTime,
      responseTime,
      ...complete ? {} : { partial: { length, segments: merged.segments } }
    };
  }

  /**
   * Stored parts have some of a range: only what's missing is fetched, as one
   * range from the first gap to the last, with `If-Range` set to the parts'
   * strong `ETag`. If the server still has that version, it sends only those
   * bytes, and they're joined to the stored ones. If the file changed,
   * `If-Range` makes the server send all of the new version, which is stored
   * and answers the range. It's `undefined` when it doesn't apply, and the
   * whole range is fetched.
   *
   * @type (request: Request, ctx: FetchContext, entry: API.CachedEntry, spec: RangeSpec) => Promise<Response | undefined>
   */
  async #fillGaps(request, ctx, entry, spec) {
    const etag = header(entry, "etag");
    if (!entry.partial || !etag || etag.startsWith("W/")) {
      return undefined;
    }
    const range = resolveRange(spec, entry.partial.length);
    if (range === undefined || range === "unsatisfiable") {
      return undefined;
    }
    const gaps = missingRanges(entry.partial.segments, range.start, range.end);
    const nothingStored = gaps.length === 1 && gaps[0].start === range.start && gaps[0].end === range.end;
    if (gaps.length === 0 || nothingStored) {
      return undefined;
    }

    const fetchRange = `bytes=${gaps[0].start}-${/** @type {{ end: number }} */ (gaps.at(-1)).end}`;
    const narrowed = new Request(request);
    narrowed.headers.set("range", fetchRange);
    narrowed.headers.set("if-range", etag);
    ctx.record.mark("cache:fill-gaps", { requested: request.headers.get("range"), fetched: fetchRange });

    const timed = await this.#fetchTimed(narrowed, ctx);
    const { response } = timed;
    if (response.status === 206 && response.headers.get("etag") === etag) {
      const merged = this.#mergePartial(request, timed, entry, new Uint8Array(await response.arrayBuffer()));
      if (!merged) {
        return undefined;
      }
      if (this.#isStorable(request, response, true)) {
        await this.#storePut(merged);
      }
      const answer = this.#serveRange(merged, spec);
      return answer && setResponseMeta(answer, { cache: "filled" });
    } else if (response.status === 200) {
      // The file changed, or the server sends all of it: this is the new version
      const whole = this.#fullEntry(request, timed, new Uint8Array(await response.arrayBuffer()));
      if (this.#isStorable(request, response)) {
        await this.#storePut(whole);
      }
      const answer = this.#serveRange(whole, spec);
      return answer && setResponseMeta(answer, { source: responseMeta(response).source ?? "network", cache: "miss" });
    } else {
      await response.body?.cancel();
      return undefined;
    }
  }

  /** @type (request: Request, response: Response, allowPartial?: boolean) => boolean */
  #isStorable(request, response, allowPartial = false) {
    const shared = this.shared;
    if (request.method !== "GET") {
      return false;
    }
    // The runtime followed a redirect, so this is the response it ended at,
    // not the response for this URL. Storing it would make a temporary
    // redirect permanent.
    if (response.redirected || (response.url && cacheKey(response.url) !== cacheKey(request.url))) {
      return false;
    }
    if (response.status < 200 || response.status === 304 || (response.status === 206 && !allowPartial)) {
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
  if (parseCacheControl(request.headers.get("cache-control")).has("no-store")) {
    return "no-store";
  }
  return mode;
};

/** @type (url: string) => string */
const cacheKey = (url) => {
  const key = new URL(url);
  key.hash = "";
  return key.href;
};

/**
 * The request headers an entry keeps for `Vary`. A range isn't part of what
 * the entry is for.
 *
 * @type (request: Request) => [string, string][]
 */
const requestHeadersOf = (request) => [...request.headers].filter(([name]) => name !== "range" && name !== "if-range");

/** @type (entry: API.CachedEntry, name: string) => string | undefined */
const header = (entry, name) => entry.headers.find(([key]) => key.toLowerCase() === name)?.[1];

/** @type (entry: API.CachedEntry, timed: Timed) => API.CachedEntry */
const mergeNotModified = (entry, { response, requestTime, responseTime }) => {
  const headers = new Headers(entry.headers);
  for (const [name, value] of withoutHopByHop(response.headers)) {
    if (!notUpdatedBy304.has(name)) {
      headers.set(name, value);
    }
  }
  response.body?.cancel().catch(() => {});
  return { ...entry, headers: [...headers], requestTime, responseTime };
};

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
