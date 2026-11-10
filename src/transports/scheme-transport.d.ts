import type { FetchContext, Fetcher } from "../layers.d.ts";

/**
 * The bottom of a stack: it gives a request to the fetcher for its URL's
 * scheme. A scheme without one is a network error, as in browsers.
 */
export class SchemeTransport implements Fetcher {
  /** Fetchers by scheme, with the colon, like `"https:"` */
  constructor(schemes: Record<string, Fetcher>);

  readonly schemes: Readonly<Record<string, Fetcher>>;

  fetch(request: Request, ctx: FetchContext): Promise<Response>;

  /** A copy with more schemes, or with some replaced */
  with(schemes: Record<string, Fetcher>): SchemeTransport;
}

/** `http:`, `https:`, and `data:` with the runtime's `fetch` */
export const networkFetcher: Fetcher;

/**
 * A transport for `http:`, `https:`, and `data:` with the runtime's `fetch`,
 * and `extra`'s schemes. It works anywhere `fetch` does.
 */
export const defaultTransport: (extra?: Record<string, Fetcher>) => SchemeTransport;
