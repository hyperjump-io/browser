import type { Decorator, FetchContext, Fetcher, Layer } from "../layers.d.ts";
import type { Session } from "../session.d.ts";

export type DedupeOptions = {
  /**
   * What makes requests the same. `undefined` leaves a request out. By
   * default, `GET` and `HEAD` requests with the same URL, cache mode, and
   * headers are the same.
   */
  key?: (request: Request, ctx: FetchContext) => string | undefined;

  /**
   * Which sessions share requests: each session its own (`"session"`, the
   * default), or a session and all its children (`"root"`), so a frame can
   * join a request its page started
   */
  scope?: "session" | "root";
};

/**
 * Requests that are the same, made while one is in flight, are one request,
 * the way a browser loads an image once when a page uses it twice. Each
 * caller gets its own copy of the response.
 */
export class Dedupe implements Layer {
  constructor(inner: Fetcher, options?: DedupeOptions);

  readonly inner: Fetcher;

  /** How many requests are in flight for a session's scope */
  inFlight(session: Session): number;

  fetch(request: Request, ctx: FetchContext): Promise<Response>;
}

export const dedupe: (options?: DedupeOptions) => Decorator<Dedupe>;
