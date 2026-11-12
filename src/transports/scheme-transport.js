import { fetcher } from "../layers.js";
import { networkError, setResponseMeta } from "../response-meta.js";

/**
 * @import * as API from "./scheme-transport.d.ts"
 * @import { Fetcher } from "../layers.d.ts"
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
      throw networkError(`The '${scheme}' scheme isn't supported, so '${request.url}' can't be fetched`, { code: "ERR_UNKNOWN_URL_SCHEME" }, request.url);
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
  ctx.record.mark("network:start", { priority: ctx.priority.value });
  let response;
  try {
    response = await globalThis.fetch(request);
  } catch (error) {
    throw fetchFailed(request, error);
  }
  ctx.record.mark("network:response", { status: response.status });
  return setResponseMeta(response, { source: "network" });
});

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
