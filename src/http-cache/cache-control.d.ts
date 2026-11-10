import type { CachedEntry } from "./http-cache.d.ts";

/**
 * A `Cache-Control` header's directives, by lowercase name. A directive
 * without an argument is `""`. The first of a repeated directive wins.
 */
export const parseCacheControl: (value: string | null | undefined) => Map<string, string>;

/** Whether a stored response's `Vary` headers match a request's */
export const varyMatches: (entry: CachedEntry, requestHeaders: Headers) => boolean;
