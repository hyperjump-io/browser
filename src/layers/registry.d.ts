import type { Decorator, FetchContext, Fetcher, Layer } from "../layers.d.ts";

/** What a registry has for a URL */
export type RegistryEntry = string | Uint8Array | ArrayBuffer | Blob | RegistryResponseInit | RegistryEntryFunction;

/** A response by its parts */
export type RegistryResponseInit = { body?: BodyInit | null; status?: number; statusText?: string; headers?: HeadersInit };

/** A response made for each request, like one read from a bundle. It has to be a new response each time. */
export type RegistryEntryFunction = (request: Request, ctx: FetchContext) => Response | Promise<Response>;

export type RegistryOptions = {
  /**
   * Documents by URL. A relative URL is resolved against `base`. They're
   * copied when the layer is made, so changing them later changes nothing.
   */
  entries?: Record<string, RegistryEntry> | Iterable<[string | URL, RegistryEntry]>;
  base?: string | URL;

  /**
   * What to answer for a URL that isn't in `entries`, like a directory for a
   * URL prefix. `undefined` is "not here".
   */
  resolve?: (url: URL, request: Request) => RegistryEntry | undefined | Promise<RegistryEntry | undefined>;

  /**
   * What happens to a URL the registry doesn't have: it's passed on
   * (`"next"`, the default), or it's a network error (`"error"`), so only
   * what's registered can be fetched
   */
  onMiss?: "next" | "error";
};

/**
 * Documents the application has, answered before anything is fetched. It's
 * like a cache, but nothing that goes through it is written to it. What it
 * has is fixed when it's made, with what `resolve` finds.
 */
export class Registry implements Layer {
  constructor(inner: Fetcher, options?: RegistryOptions);

  readonly inner: Fetcher;

  /** Whether a URL is in `entries`. `resolve` isn't asked. */
  has(url: string | URL): boolean;

  /** The URLs in `entries` */
  urls(): IterableIterator<string>;

  fetch(request: Request, ctx: FetchContext): Promise<Response>;
}

export const registry: (options?: RegistryOptions) => Decorator<Registry>;
