import type { Fetcher } from "./layers.d.ts";
import type { Priority, PrioritySignal } from "./priority.d.ts";
import type { FetchRecord, Observer } from "./fetch-record.d.ts";
import type { Registry } from "./registry.d.ts";

/**
 * A session's configuration. It's an interface so what's built on a session
 * can add to it, like the `mediaTypes` that `get` parses documents with.
 */
export interface HyperjumpConfig {
  /**
   * What the session fetches through: a transport, or layers on one. Without
   * one, the session has a stack of its own: in Node.js, a `scheduler()` on
   * `nodeTransport()`, and in a browser, `defaultTransport()`.
   */
  stack?: Fetcher;

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

  /**
   * Documents the application already has, answered before `allowRetrieval`
   * and the stack, like a copy of a document bundled with it. They aren't fetched, so
   * `allowRetrieval` doesn't apply to them. Only a `GET` or `HEAD` is asked
   * of it, by the URL without its fragment. A redirect to a URL it has is
   * fetched. Its answers are in traces, with the source `"registry"`.
   */
  registry?: Registry;

  /** More redirects than this is a network error. Default 20, the Fetch standard's. */
  maxRedirects?: number;

  /**
   * The schemes a redirect can lead to. Default `["http:", "https:"]`, as in
   * browsers, so a server can't send a request to `file:` or `data:`.
   */
  redirectSchemes?: string[];
}

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
export type HyperjumpFetchInit = Omit<RequestInit, "cache" | "priority" | "referrer"> & {
  /** How the HTTP cache handles the request (see {@link CacheMode}) */
  cache?: CacheMode;

  /**
   * Like `fetchpriority` in browsers. A {@link PrioritySignal}, from a
   * `PriorityController`, can change while the request waits.
   */
  priority?: Priority | PrioritySignal;

  /**
   * What caused the request: an earlier request's record, or its response,
   * like the document that referred to this one. Traces show requests under
   * it, and only a `file:` initiator can refer to a `file:` URL. A request
   * without one is the application's own.
   */
  initiator?: FetchRecord | Response;

  /**
   * The URL of the document the request came from, for a document that has
   * no record, like one the session didn't retrieve. Without it, it's the
   * initiator's response's URL. Only a `file:` document can refer to a
   * `file:` URL. A browser replaces a `referrer` from another origin, so
   * the session keeps it, as `record.referrer`, and doesn't give it to the
   * runtime.
   */
  referrer?: string | URL;
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
export interface Hyperjump<C extends HyperjumpConfig = HyperjumpConfig> {
  /**
   * The configuration it was created with. It can have more than the session
   * reads, for what's built on a session, like the `mediaTypes` that `get`
   * parses documents with.
   */
  readonly config: Readonly<C>;

  readonly stack: Fetcher;

  /**
   * What relative URLs are resolved against: the working directory in
   * Node.js, or the page in a browser, as it was when the session was
   * created. There's none where there's neither, such as in a worker.
   */
  readonly contextUrl: string | undefined;

  /** Aborts when the session is closed */
  readonly signal: AbortSignal;

  readonly closed: boolean;

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
  fetch(input: string | URL | Request, init?: HyperjumpFetchInit): Promise<Response>;

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

/**
 * Creates a session. The constructor is declared apart from the session's
 * type so the two can say different things about a configuration that isn't
 * given: a session created without one has none, and a session that's only
 * known as a `Hyperjump` could have any.
 */
export type HyperjumpConstructor = {
  /**
   * The configuration is a plain value, so another session with the same one
   * is `new Hyperjump(config)`. The session has the type of the
   * configuration it's given, so what's built on a session can tell what it
   * was configured with, like the media types its documents are in.
   */
  new<C extends HyperjumpConfig = {}>(config?: C): Hyperjump<C>;
  readonly prototype: Hyperjump;
};

export const Hyperjump: HyperjumpConstructor;
