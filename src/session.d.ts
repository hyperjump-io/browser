import type { Fetcher } from "./layers.d.ts";
import type { Priority, PrioritySignal } from "./priority.d.ts";
import type { FetchRecord, Observer } from "./fetch-record.d.ts";

export type SessionOptions = {
  /** Relative URLs are resolved against it, like a document's base URL */
  baseURL?: string | URL;

  /**
   * Headers by URL, like credentials. A key that ends with `/` is for every
   * URL under it, and any other key is only for itself. A relative key is
   * resolved against `baseURL`. When several keys match, a longer key wins a
   * header both have, and a request's own headers win over all of them.
   * Each redirect gets the headers for the URL it leads to.
   */
  headers?: Record<string, HeadersInit | HeadersFunction>;

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
   * it, and a resource map answers with the resources it contains.
   */
  initiator?: FetchRecord | Response;
};

/**
 * The requests that belong together, like a page load's. A session sits on
 * a stack and gives it what the stack can't know: a base URL, default
 * headers, a signal that closing the session aborts, and state for layers
 * that lives as long as the session. It follows redirects one at a time,
 * each as a new request down the stack, so every layer sees each URL, by
 * the Fetch standard's rules. A response that was redirected has its final
 * `url`, `redirected`, and the URLs it went through as
 * `responseMeta(response).redirects`.
 */
export class Session {
  /** Without a stack, it's `defaultTransport()` */
  constructor(stack?: Fetcher, options?: SessionOptions & { parent?: Session });

  readonly stack: Fetcher;

  /** The session this is a child of (see {@link Session.child}) */
  readonly parent: Session | undefined;

  readonly baseURL: URL | undefined;

  /** Aborts when this session or one of its parents is closed */
  get signal(): AbortSignal;

  get closed(): boolean;

  /** The top of the session's parents: the page, for a frame. A session without a parent is its own root. */
  get root(): Session;

  /** This session, then its parent, and so on to the root */
  lineage(): Generator<Session, void, unknown>;

  /**
   * State for a layer, or anything else, that lives as long as the session.
   * It's made by `init` the first time it's asked for. A layer uses itself as
   * the key.
   */
  state<T>(key: object, init: () => T): T;

  /** Resolve a URL against the base URL */
  resolve(url: string | URL): URL;

  /**
   * Fetch through the stack. Like `fetch`, it rejects with a `TypeError` for
   * a network error.
   *
   * @throws The session's signal's reason if the session is closed.
   */
  fetch(input: string | URL | Request, init?: SessionFetchInit): Promise<Response>;

  /**
   * Watch the requests of this session and its children: when each starts,
   * what the layers mark on it, when its response arrives, and when it ends.
   * With `bodies`, records keep the response bodies. Returns a function that
   * stops watching.
   */
  observe(observer: Observer, options?: { bodies?: boolean }): () => void;

  /**
   * A session nested in this one, like an iframe. It has the same stack. Its
   * base URL is resolved against this one's, it has this one's redirect
   * options unless it's given its own, and it has this one's headers, with a
   * key it's given replacing the same key of this one's. Its state is its own,
   * and closing this one closes it.
   */
  child(options?: SessionOptions): Session;

  /** Abort everything the session and its children started, and refuse new requests */
  close(reason?: unknown): void;
}
