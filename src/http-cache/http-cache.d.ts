import type { Decorator, FetchContext, Fetcher, Layer } from "../layers.d.ts";

/** A stored response, as data, so a store can keep it anywhere */
export type CachedEntry = {
  url: string;
  status: number;
  statusText: string;
  headers: [string, string][];
  body: Uint8Array;

  /** The headers of the request it was for, to match a `Vary` */
  requestHeaders: [string, string][];

  /** Milliseconds since the epoch, by the cache's clock */
  requestTime: number;
  responseTime: number;
};

/**
 * Where the HTTP cache keeps responses. The cache does the HTTP. A store only
 * keeps entries by URL, one for each `Vary` variant.
 */
export interface CacheStore {
  /** Every variant for a URL */
  match(url: string): CachedEntry[] | Promise<CachedEntry[]>;

  /** Store an entry, replacing the variant it's for */
  put(entry: CachedEntry): void | Promise<void>;

  /** Remove every variant for a URL */
  delete(url: string): void | Promise<void>;
}

export type HttpCacheOptions = {
  /** A new `MemoryCacheStore` by default */
  store?: CacheStore;

  /**
   * A shared cache, like a proxy's: it uses `s-maxage`, doesn't store
   * `private`, and is careful with `Authorization`. Default `false`: a
   * private cache, like a browser's.
   */
  shared?: boolean;

  /**
   * The part of the time since `Last-Modified` that a response without a
   * lifetime is fresh for. RFC 9111 suggests 0.1.
   */
  heuristicFraction?: number;

  /**
   * How many seconds a 301 or a 308 without a lifetime is fresh for. Default
   * a day. `0` leaves them to `heuristicFraction`.
   */
  permanentRedirectLifetime?: number;

  /**
   * A lifetime, in seconds, for a response that doesn't say one, asked first.
   * `undefined` leaves it to the built-in rules. It's only asked for the
   * statuses RFC 9111 allows.
   */
  heuristic?: (response: { url: string; status: number; headers: Headers }) => number | undefined;

  /** Bodies bigger than this many bytes aren't stored */
  maxBodySize?: number;

  /**
   * Called when the store fails, like a full disk. The cache goes on as if it
   * had missed, so a store never fails a request.
   */
  onStoreError?: (error: unknown, operation: "match" | "put" | "delete", url: string) => void;

  /** The clock, in milliseconds since the epoch, for tests */
  now?: () => number;
};

/**
 * An HTTP cache, by RFC 9111 and the Fetch standard's cache modes:
 * freshness, revalidation, `Vary`, `stale-while-revalidate`, request
 * directives, and invalidation by unsafe methods.
 */
export class HttpCache implements Layer {
  constructor(inner: Fetcher, options?: HttpCacheOptions);

  readonly inner: Fetcher;
  readonly store: CacheStore;
  readonly shared: boolean;

  /** Remove every variant of a URL */
  purge(url: string | URL): Promise<void>;

  fetch(request: Request, ctx: FetchContext): Promise<Response>;
}

export const httpCache: (options?: HttpCacheOptions) => Decorator<HttpCache>;
