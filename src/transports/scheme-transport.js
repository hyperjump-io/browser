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
      throw networkError(`The '${scheme}' scheme isn't supported, so '${request.url}' can't be fetched`);
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
  const response = await globalThis.fetch(request);
  ctx.record.mark("network:response", { status: response.status });
  return setResponseMeta(response, { source: "network" });
});

/** @type typeof API.defaultTransport */
export const defaultTransport = (extra = {}) => new SchemeTransport({
  "http:": networkFetcher,
  "https:": networkFetcher,
  "data:": networkFetcher,
  ...extra
});
