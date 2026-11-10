import type { FetchRecord } from "./fetch-record.d.ts";
import type { Session } from "./session.d.ts";

/**
 * What's known about a response that isn't part of it, like what devtools
 * shows as "(from disk cache)". It's kept outside the response, so the
 * response stays a standard `Response`.
 */
export type ResponseMeta = {
  /**
   * The part of the stack that made the response, like `"network"`, `"file"`,
   * or `"http-cache"`
   */
  source?: string;

  /** What the HTTP cache did, if the request went through one */
  cache?: "hit" | "miss" | "revalidated" | "stale" | "bypass";

  /**
   * A parsed form of the body that whatever made the response already had,
   * like the object a resource map's resource was found in. Use it instead of
   * parsing the body to keep the object's identity.
   */
  value?: unknown;

  /** The record of the {@link Session.fetch} that the response is for */
  record?: FetchRecord;
};

/** What's known about a response, or `{}` if nothing is */
export const responseMeta: (response: Response) => Readonly<ResponseMeta>;

/** Add to what's known about a response. Returns the response. */
export const setResponseMeta: (response: Response, meta: ResponseMeta) => Response;

/** `response.clone()`, and the clone gets the response's meta */
export const cloneResponse: (response: Response) => Response;

/**
 * Give a response that was made with `new Response` the URL it's for, which
 * the constructor can't set. Returns the response.
 */
export const withUrl: (response: Response, url: string) => Response;

/**
 * The same response with another body: its status, headers, URL,
 * `redirected`, and meta are kept. For a layer that wraps a body. An opaque
 * response can't be made again, so it isn't for one.
 */
export const replaceBody: (response: Response, body: ReadableStream<Uint8Array> | null) => Response;

/**
 * Call `done` once, when the response's body has been read to the end,
 * cancelled, or has failed, or right away if it has no body or is opaque.
 * Returns the response to give on, whose body is wrapped. `onChunk` sees
 * each chunk as it's read.
 */
export const trackBody: (response: Response, done: () => void, onChunk?: (chunk: Uint8Array) => void) => Response;

/** A network error, the `TypeError` `fetch` rejects with */
export const networkError: (message: string, cause?: unknown) => TypeError;
