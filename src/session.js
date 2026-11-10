import { responseMeta, setResponseMeta, trackBody } from "./response-meta.js";
import { PrioritySignal } from "./priority.js";
import { recordChunk, recordEnd, recordResponse, startRecord } from "./fetch-record.js";
import { defaultTransport } from "./transports/scheme-transport.js";

/**
 * @import * as API from "./session.d.ts"
 * @import { FetchContext, Fetcher } from "./layers.d.ts"
 * @import { Observer, TraceEvent } from "./fetch-record.d.ts"
 */

/** @implements API.Session */
export class Session {
  /** @type AbortController */
  #controller = new AbortController();

  /** @type AbortSignal */
  #signal;

  /** @type Headers */
  #headers;

  /** @type Map<object, unknown> */
  #state = new Map();

  /**
   * Observers, with whether each wants bodies
   *
   * @type Map<Observer, { bodies: boolean }>
   */
  #observers = new Map();

  /**
   * @param {Fetcher} [stack]
   * @param {API.SessionOptions & { parent?: API.Session }} [options]
   */
  constructor(stack = defaultTransport(), options = {}) {
    this.stack = stack;
    /** @type API.Session | undefined */
    this.parent = options.parent;
    this.baseURL = options.baseURL === undefined ? undefined : new URL(options.baseURL);
    this.#headers = new Headers(options.headers);
    this.#signal = this.parent
      ? AbortSignal.any([this.#controller.signal, this.parent.signal])
      : this.#controller.signal;
  }

  get signal() {
    return this.#signal;
  }

  get closed() {
    return this.#signal.aborted;
  }

  get root() {
    /** @type API.Session */
    let session = this;
    while (session.parent) {
      session = session.parent;
    }
    return session;
  }

  /** @type API.Session["lineage"] */
  * lineage() {
    /** @type API.Session | undefined */
    let session = this;
    while (session) {
      yield session;
      session = session.parent;
    }
  }

  /**
   * @template T
   * @param {object} key
   * @param {() => T} init
   * @returns {T}
   */
  state(key, init) {
    if (!this.#state.has(key)) {
      this.#state.set(key, init());
    }
    return /** @type T */ (this.#state.get(key));
  }

  /** @type API.Session["resolve"] */
  resolve(url) {
    return new URL(url, this.baseURL);
  }

  /** @type API.Session["fetch"] */
  async fetch(input, init = {}) {
    if (this.closed) {
      throw this.signal.reason;
    }

    const { cache, priority, destination, initiator, ...requestInit } = init;
    const callerSignal = init.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = callerSignal ? AbortSignal.any([this.signal, callerSignal]) : this.signal;

    const request = input instanceof Request
      ? new Request(input, { ...requestInit, signal })
      : new Request(this.resolve(input), { ...requestInit, signal });
    for (const [name, value] of this.#headers) {
      if (!request.headers.has(name)) {
        request.headers.set(name, value);
      }
    }

    const record = startRecord({
      url: request.url,
      method: request.method,
      destination: destination ?? "",
      initiator: initiator instanceof Response ? responseMeta(initiator).record : initiator,
      session: this,
      priority: priority instanceof PrioritySignal ? priority.value : priority ?? "auto",
      requestHeaders: [...request.headers],
      notify: (event) => this.#notify(event)
    });

    /** @type FetchContext */
    const ctx = {
      session: this,
      cacheMode: cache ?? "default",
      signal,
      priority: priority instanceof PrioritySignal ? priority : PrioritySignal.of(priority ?? "auto"),
      destination: record.destination,
      record
    };

    this.#notify({ type: "start", record });
    let response;
    try {
      response = await this.stack.fetch(request, ctx);
    } catch (error) {
      recordEnd(record, error);
      throw error;
    }
    setResponseMeta(response, { record });
    recordResponse(record, response);

    // Knowing when a body is done means wrapping it, so it's only done while
    // someone is watching
    const watching = this.#watching();
    if (!watching.observed) {
      return response;
    }
    return trackBody(response, () => recordEnd(record), (chunk) => recordChunk(record, chunk, watching.bodies));
  }

  /** @type API.Session["observe"] */
  observe(observer, options = {}) {
    this.#observers.set(observer, { bodies: options.bodies ?? false });
    return () => {
      this.#observers.delete(observer);
    };
  }

  /** @type API.Session["child"] */
  child(options = {}) {
    const headers = new Headers(this.#headers);
    for (const [name, value] of new Headers(options.headers)) {
      headers.set(name, value);
    }
    return new Session(this.stack, {
      baseURL: options.baseURL === undefined ? this.baseURL : new URL(options.baseURL, this.baseURL),
      headers,
      parent: this
    });
  }

  /** @type API.Session["close"] */
  close(reason = new DOMException("The session was closed", "AbortError")) {
    this.#controller.abort(reason);
  }

  /** Whether anyone is watching this session or a parent, and whether any of them want bodies */
  #watching() {
    let observed = false;
    let bodies = false;
    for (const session of this.#sessions()) {
      for (const options of session.#observers.values()) {
        observed = true;
        bodies ||= options.bodies;
      }
    }
    return { observed, bodies };
  }

  /**
   * Tell the observers of this session and its parents. An observer that
   * throws doesn't stop the request or the other observers.
   *
   * @param {TraceEvent} event
   */
  #notify(event) {
    for (const session of this.#sessions()) {
      for (const observer of session.#observers.keys()) {
        try {
          observer(event);
        } catch (error) {
          queueMicrotask(() => {
            throw error;
          });
        }
      }
    }
  }

  /**
   * This session and its parents, as this class, so their private fields can
   * be read. A parent is always a `Session`, because only `child` makes one.
   *
   * @yields {Session}
   */
  * #sessions() {
    for (const session of this.lineage()) {
      yield /** @type Session */ (session);
    }
  }
}
