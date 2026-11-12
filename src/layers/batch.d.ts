import type { Decorator, FetchContext, Fetcher, Layer } from "../layers.d.ts";

export type BatchOptions = {
  /**
   * A key for requests that can be sent together, like the endpoint they'd
   * be combined into, or `undefined` to pass a request on
   */
  match: (request: Request, ctx: FetchContext) => string | undefined;

  /**
   * Send a batch: usually one combined request with `inner.fetch`, split into
   * a response for each request, in the same order. The batch belongs to
   * `ctx.session`, so give the combined request its signal.
   */
  execute: (requests: Request[], inner: Fetcher, ctx: FetchContext) => Promise<Response[]>;

  /** How long to wait for more requests after the first. Default `0`: the end of the current task. */
  windowMs?: number;

  /** Send a batch as soon as it has this many requests */
  maxSize?: number;
};

/**
 * Collects requests made at about the same time and sends them together. The
 * layer does the timing. What together means, like a `/batch` endpoint or
 * `?ids=1,2,3`, is `execute`'s.
 */
export class Batch implements Layer {
  constructor(inner: Fetcher, options: BatchOptions);

  readonly inner: Fetcher;

  fetch(request: Request, ctx: FetchContext): Promise<Response>;
}

export const batch: (options: BatchOptions) => Decorator<Batch>;
