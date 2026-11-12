import type { Fetcher } from "../layers.d.ts";

export type FileSchemeOptions = {
  /**
   * Only files in this directory can be fetched. Anything else is a network
   * error, and so is a symlink in it that points outside it. Use it whenever
   * URLs can come from documents you didn't write.
   */
  root?: string;

  /** More extensions' content types, without the dot, like `{ ts: "text/typescript" }` */
  contentTypes?: Record<string, string>;
};

/**
 * `file:` URLs, on a server. As in a browser, a missing file, a directory, or
 * a method other than `GET` or `HEAD` is a network error, not a 404. A file
 * is opened before it's answered, so one that can't be read is a network
 * error too, whose cause is the filesystem's error, like `ENOENT`. A
 * response has the file's `Content-Type` by its extension, its
 * `Content-Length`, and its `Last-Modified`, and its body is streamed.
 *
 * In a browser, it throws.
 */
export const fileScheme: (options?: FileSchemeOptions) => Fetcher;
