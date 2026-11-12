import type { Decorator, FetchContext, Fetcher, Layer } from "../layers.d.ts";
import type { Hyperjump } from "../hyperjump.d.ts";

export type ThrottleOptions = {
  /** Delayable requests in flight at once for a session when nothing important is loading. Default 10. */
  maxDelayable?: number;

  /** Delayable requests in flight at once for a session while something important is loading. Default 1. */
  maxDelayableWhileBusy?: number;

  /**
   * Which requests can be held back. By default, ones with priority `"low"`.
   * It's asked again when a waiting request's priority changes.
   */
  isDelayable?: (request: Request, ctx: FetchContext) => boolean;

  /** When a request stops counting as in flight, as for the scheduler. Default `"body"`. */
  releaseOn?: "body" | "headers";
};

/**
 * Holds back a session's low-priority requests while its important ones load,
 * like Chrome's resource scheduler. Important requests are never held back.
 */
export class Throttle implements Layer {
  constructor(inner: Fetcher, options?: ThrottleOptions);

  readonly inner: Fetcher;

  /** What's in flight and held back for a session */
  stats(session: Hyperjump): { important: number; delayable: number; queued: number };

  fetch(request: Request, ctx: FetchContext): Promise<Response>;
}

export const throttle: (options?: ThrottleOptions) => Decorator<Throttle>;
