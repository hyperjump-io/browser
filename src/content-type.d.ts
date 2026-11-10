/**
 * The content type for a URL's or a path's extension, for what has no server
 * to say, like a file. `overrides` maps more extensions, without the dot,
 * like `{ ts: "text/typescript" }`.
 */
export const contentTypeByExtension: (pathOrUrl: string, overrides?: Record<string, string>) => string | undefined;
