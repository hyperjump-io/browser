import { fetcher } from "../layers.js";
import { networkError, setResponseMeta } from "../response-meta.js";
import { relativeFileUrl } from "../file-urls.js";

/**
 * @import * as API from "./scheme-transport.d.ts"
 * @import { FetchContext, Fetcher } from "../layers.d.ts"
 */

/** @implements API.SchemeTransport */
export class SchemeTransport {
  /** @param {Record<string, Fetcher>} schemes */
  constructor(schemes) {
    this.schemes = Object.freeze({ ...schemes });
  }

  /** @type API.SchemeTransport["fetch"] */
  async fetch(request, ctx) {
    const scheme = new URL(request.url).protocol;
    const handler = this.schemes[scheme];
    if (!handler) {
      throw networkError(`The '${scheme}' scheme isn't supported, so '${relativeFileUrl(request.url)}' can't be fetched`, { code: "ERR_UNKNOWN_URL_SCHEME" }, request.url);
    }
    return handler.fetch(request, ctx);
  }

  /** @type API.SchemeTransport["with"] */
  with(schemes) {
    return new SchemeTransport({ ...this.schemes, ...schemes });
  }
}

/** @type typeof API.networkFetcher */
export const networkFetcher = fetcher(async (request, ctx) => {
  const sent = withCacheMode(request, ctx.cacheMode);
  ctx.record.mark("network:start", { priority: ctx.priority.value });
  let response;
  try {
    response = await globalThis.fetch(sent);
  } catch (error) {
    throw fetchFailed(request, error);
  }
  ctx.record.mark("network:response", { status: response.status });
  return setResponseMeta(response, { source: "network" });
});

/**
 * A request with the session's cache mode, for the runtime. The session
 * doesn't put it on the request, so the layers have it from the context,
 * but the runtime follows it: it sends the headers the Fetch standard adds
 * for it, like `Pragma: no-cache` for `reload`, so a cache between here and
 * the server doesn't answer, and a browser's own cache follows it.
 *
 * `only-if-cached` that reaches the network is a miss, because no cache
 * above had it. It's never sent: Node.js's `fetch` has no cache, so it
 * sends it, and a browser refuses it for another origin.
 *
 * @type (request: Request, mode: FetchContext["cacheMode"]) => Request
 * @throws {TypeError} A network error, if it's `only-if-cached`.
 */
const withCacheMode = (request, mode) => {
  const { protocol } = new URL(request.url);
  if (mode === "default" || (protocol !== "http:" && protocol !== "https:")) {
    return request;
  }
  if (mode === "only-if-cached") {
    throw networkError(`'${request.url}' isn't in a cache, and its cache mode is "only-if-cached"`, { code: "ERR_CACHE_MISS" }, request.url);
  }
  return new Request(request, { cache: mode });
};

/**
 * A runtime's network error says only that the fetch failed, like Node.js's
 * "fetch failed", so it's given the URL and its cause's message. Its cause
 * is the runtime's, with its `code`, like `ENOTFOUND`. An abort is given on
 * as it is.
 *
 * @type (request: Request, error: unknown) => unknown
 */
const fetchFailed = (request, error) => {
  if (request.signal.aborted || !(error instanceof TypeError)) {
    return error;
  }
  const cause = error.cause ?? error;
  const reason = error.cause instanceof Error ? `: ${error.cause.message}` : "";
  return networkError(`Failed to fetch '${request.url}'${reason}`, cause, request.url);
};

/** @type typeof API.defaultTransport */
export const defaultTransport = (extra = {}) => new SchemeTransport({
  "http:": networkFetcher,
  "https:": networkFetcher,
  "data:": networkFetcher,
  ...extra
});
