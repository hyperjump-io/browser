import type { Fetcher } from "./layers.d.ts";
import type { Priority, PrioritySignal } from "./priority.d.ts";
import type { FetchRecord, Observer } from "./fetch-record.d.ts";

export type SessionOptions = {
  /**
   * Headers by URL, like credentials. A key that ends with `/` is for every
   * URL under it, and any other key is only for itself. A relative key is
   * resolved against the working directory in Node.js or the page in a
   * browser. When several keys match, a longer key wins a
   * header both have, and a request's own headers win over all of them.
   * Each redirect gets the headers for the URL it leads to.
   */
  headers?: Record<string, HeadersInit | HeadersFunction>;

  /**
   * The URLs the session can fetch, so a document can't make it fetch
   * whatever it names. One that ends with `/` allows every URL under it, and
   * any other allows only itself. A relative one is resolved against the
   * working directory in Node.js or the page in a browser. The default is
   * what's local to the application: `["./"]`, the working directory, in
   * Node.js, and `["/"]`, the page's origin, in a browser. A `file:` URL is
   * compared by its real path. Fetching a URL it doesn't allow,
   * a redirect to one, or a response from one, is a network error.
   */
  allowRetrieval?: string[];

  /** More redirects than this is a network error. Default 20, the Fetch standard's. */
  maxRedirects?: number;

  /**
   * The schemes a redirect can lead to. Default `["http:", "https:"]`, as in
   * browsers, so a server can't send a request to `file:` or `data:`.
   */
  redirectSchemes?: string[];
};

/**
 * Headers for a URL, which can be async, so a token can be refreshed. It's
 * given the URL without its fragment.
 */
export type HeadersFunction = (url: URL) => HeadersInit | undefined | Promise<HeadersInit | undefined>;

/**
 * The Fetch standard's cache modes, like `Request.cache`. A runtime on a
 * server ignores `Request.cache` or refuses some of its values, so the
 * session gives it to the stack.
 */
export type CacheMode = "default" | "no-store" | "reload" | "no-cache" | "force-cache" | "only-if-cached";

/** `RequestInit`, with what the session gives the stack instead of the runtime */
export type SessionFetchInit = Omit<RequestInit, "cache" | "priority"> & {
  /** How the HTTP cache handles the request (see {@link CacheMode}) */
  cache?: CacheMode;

  /**
   * Like `fetchpriority` in browsers. A {@link PrioritySignal}, from a
   * `PriorityController`, can change while the request waits.
   */
  priority?: Priority | PrioritySignal;

  /**
   * What the resource is for, like `Request.destination` in browsers:
   * `"document"`, `"style"`, `"script"`, `"image"`, `"font"`, `"json"`, or one
   * of an application's
   */
  destination?: string;

  /**
   * What caused the request: an earlier request's record, or its response,
   * like the document that referred to this one. Traces show requests under
   * it, and only a `file:` initiator can refer to a `file:` URL. A request
   * without one is the application's own.
   */
  initiator?: FetchRecord | Response;
};

/**
 * The requests that belong together, like a page load's. A session sits on
 * a stack and gives it what the stack can't know: what it can fetch, the
 * headers for each URL, a signal that closing the session aborts, and state for layers
 * that lives as long as the session. It follows redirects one at a time,
 * each as a new request down the stack, so every layer sees each URL, by
 * the Fetch standard's rules. A response that was redirected has its final
 * `url`, `redirected`, and the URLs it went through as
 * `responseMeta(response).redirects`.
 */
export class Session {
  /** Without a stack, it's `defaultTransport()` */
  constructor(stack?: Fetcher, options?: SessionOptions);

  readonly stack: Fetcher;

  /** Aborts when the session is closed */
  get signal(): AbortSignal;

  get closed(): boolean;

  /**
   * State for a layer, or anything else, that lives as long as the session.
   * It's made by `init` the first time it's asked for. A layer uses itself as
   * the key.
   */
  state<T>(key: object, init: () => T): T;

  /**
   * Fetch through the stack. A relative URL is resolved against the working
   * directory in Node.js or the page in a browser, which the session reads
   * when it's created. Like `fetch`, it rejects with a `TypeError` for a
   * network error. Its message says what went wrong, and its `cause.code`
   * says it to code, like `ENOENT` or `ERR_RETRIEVAL_NOT_ALLOWED`.
   *
   * @throws The session's signal's reason if the session is closed.
   */
  fetch(input: string | URL | Request, init?: SessionFetchInit): Promise<Response>;

  /**
   * Watch the session's requests: when each starts,
   * what the layers mark on it, when its response arrives, and when it ends.
   * With `bodies`, records keep the response bodies. Returns a function that
   * stops watching.
   */
  observe(observer: Observer, options?: { bodies?: boolean }): () => void;

  /** Abort everything the session started, and refuse new requests */
  close(reason?: unknown): void;
}
