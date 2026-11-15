import type { Hyperjump } from "./hyperjump.d.ts";

/**
 * The documents an application already has, which a session answers before
 * `allowRetrieval` and the stack (see `HyperjumpConfig.registry`). A document
 * the application gives the session isn't fetched, so `allowRetrieval`,
 * which keeps a document from making the session fetch whatever it names,
 * doesn't apply to it.
 */
export type Registry = {
  /**
   * The response for a URL the registry has, without its fragment, or
   * `undefined` if it doesn't have it, so the session fetches it. It can
   * throw, like a fetch, to say the URL is the registry's but can't be
   * used.
   */
  get(url: string, ctx: RegistryContext): Response | undefined | Promise<Response | undefined>;
};

/** What a registry is asked with */
export type RegistryContext = {
  /** The session that's asking */
  readonly session: Hyperjump;
};

/** What a registry made with {@link registry} has for a URL */
export type RegistryEntry = string | Uint8Array | ArrayBuffer | Blob | RegistryResponseInit | RegistryEntryFunction;

/** A response by its parts */
export type RegistryResponseInit = { body?: BodyInit | null; status?: number; statusText?: string; headers?: HeadersInit };

/**
 * A response made each time a URL is asked for, like one read from a bundle.
 * It has to be a new response each time, because a body can only be read
 * once.
 */
export type RegistryEntryFunction = (url: string, ctx: RegistryContext) => Response | Promise<Response>;

/**
 * A registry of entries by URL. A relative URL is resolved against `base`,
 * or the working directory in Node.js or the page in a browser. The entries
 * are copied, so changing them later changes nothing. A response that isn't
 * a `file:` URL needs a `Content-Type` for a media type to parse it.
 */
export const registry: (entries: Record<string, RegistryEntry> | Iterable<[string | URL, RegistryEntry]>, options?: { base?: string | URL }) => Registry;
