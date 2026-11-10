import type { Decorator, FetchContext, Fetcher, Layer } from "../layers.d.ts";

export type SchedulerOptions = {
  /**
   * How many requests can be in flight at once for each key, which is each
   * origin by default. Default 6, the HTTP/1.1 limit for a host that browsers
   * use. A function can give a key its own, like more for an HTTP/2 origin.
   */
  perKey?: number | ((key: string) => number);

  /** How many requests can be in flight at once for every key together. Default 256, like Chrome. */
  total?: number;

  /**
   * What shares a limit. By default, an `http:` or `https:` request's origin.
   * `undefined` isn't limited, which is the default for other schemes.
   */
  key?: (request: Request, ctx: FetchContext) => string | undefined;

  /**
   * When a request is done with its slot: when its body is read, cancelled,
   * or fails (`"body"`, the default), or when its response arrives
   * (`"headers"`)
   */
  releaseOn?: "body" | "headers";
};

export type SchedulerStats = {
  active: number;
  queued: number;

  /** Requests in flight and waiting, for each key that has any */
  byKey: Record<string, { active: number; queued: number }>;
};

/**
 * Connection limits and priorities. A request over a limit waits, and
 * waiting requests start by priority, then in the order they came. A request
 * that can start right away does, whatever its priority. Its limits are the
 * network's, so they're shared by every session on the stack.
 */
export class Scheduler implements Layer {
  constructor(inner: Fetcher, options?: SchedulerOptions);

  readonly inner: Fetcher;

  stats(): SchedulerStats;

  fetch(request: Request, ctx: FetchContext): Promise<Response>;
}

export const scheduler: (options?: SchedulerOptions) => Decorator<Scheduler>;
