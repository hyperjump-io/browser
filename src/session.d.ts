import type { Fetcher } from "./layers.d.ts";
import type { Priority, PrioritySignal } from "./priority.d.ts";
import type { FetchRecord, Observer } from "./fetch-record.d.ts";

export type SessionOptions = {
  /** Relative URLs are resolved against it, like a document's base URL */
  baseURL?: string | URL;

  /** Headers every request gets unless it has them, like `User-Agent` */
  headers?: HeadersInit;
};

/** `RequestInit`, with what the session gives the stack instead of the runtime */
export type SessionFetchInit = Omit<RequestInit, "priority"> & {
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
   * like the document that referred to this one
   */
  initiator?: FetchRecord | Response;
};

/**
 * The requests that belong together, like a page load's. A session sits on
 * a stack and gives it what the stack can't know: a base URL, default
 * headers, a signal that closing the session aborts, and state for layers
 * that lives as long as the session.
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
   * base URL is resolved against this one's, it has this one's headers unless
   * it's given its own, its state is its own, and closing this one closes it.
   */
  child(options?: SessionOptions): Session;

  /** Abort everything the session and its children started, and refuse new requests */
  close(reason?: unknown): void;
}
