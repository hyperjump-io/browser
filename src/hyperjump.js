import { responseMeta, setResponseMeta, trackBody, withUrl } from "./response-meta.js";
import { PrioritySignal } from "./priority.js";
import { recordChunk, recordEnd, recordResponse, startRecord } from "./fetch-record.js";
import { follow, sentHeaders } from "./redirects.js";
import { urlEntries } from "./url-entries.js";
import { headersFor } from "./request-headers.js";
import { allows, realEntries, refused, resolveAllowRetrieval } from "./allowed-urls.js";
import { canRefer, referrerFor, refusedReference, refusedReferenceResponse } from "./file-references.js";
import { contextUrl, defaultAllowRetrieval } from "#context-url";
import { defaultStack } from "#default-stack";

/**
 * @import * as API from "./hyperjump.d.ts"
 * @import { FetchContext, Fetcher } from "./layers.d.ts"
 * @import { Observer, TraceEvent } from "./fetch-record.d.ts"
 * @import { UrlEntries } from "./url-entries.js"
 */

/**
 * @template {API.HyperjumpConfig} [C=API.HyperjumpConfig]
 * @implements {API.Hyperjump<C>}
 */
export class Hyperjump {
  /** @type AbortController */
  #controller = new AbortController();

  /**
   * What relative URLs are resolved against: the working directory in
   * Node.js, or the page in a browser. It's read once, so everything the
   * session does sees the same one.
   *
   * @type URL | undefined
   */
  #contextUrl = contextUrl();

  /** @type UrlEntries<HeadersInit | API.HeadersFunction> */
  #headers;

  /**
   * The URLs it can fetch, resolved, or the error a check throws when the
   * default has nothing to resolve against
   *
   * @type string[] | TypeError
   */
  #allowRetrieval;

  /**
   * The entries by their real paths, found the first time a URL is checked
   * and kept for the session
   *
   * @type Promise<import("./allowed-urls.js").RealEntries> | undefined
   */
  #realEntries;

  /** @type import("./redirects.js").FollowPolicy */
  #policy;

  /** @type Map<object, unknown> */
  #state = new Map();

  /**
   * Observers, with whether each wants bodies
   *
   * @type Map<Observer, { bodies: boolean }>
   */
  #observers = new Map();

  /** @param {C} [config] */
  constructor(config = /** @type C */ ({})) {
    this.config = config;
    /** @type Fetcher */
    this.stack = config.stack ?? defaultStack();
    this.contextUrl = this.#contextUrl?.href;
    this.#headers = urlEntries(config.headers ?? {}, this.#contextUrl);
    this.#allowRetrieval = resolveAllowRetrieval(config.allowRetrieval, this.#contextUrl, defaultAllowRetrieval);
    this.#policy = {
      max: config.maxRedirects ?? 20,
      schemes: [...config.redirectSchemes ?? ["http:", "https:"]],
      headers: (url) => headersFor(this.#headers, url),
      allows: (url) => this.#allows(url)
    };
  }

  get signal() {
    return this.#controller.signal;
  }

  get closed() {
    return this.signal.aborted;
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

  /** @type API.Hyperjump["fetch"] */
  async fetch(input, init = {}) {
    if (this.closed) {
      throw this.signal.reason;
    }

    const { cache, priority, initiator, referrer: givenReferrer, ...requestInit } = init;
    const callerSignal = init.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = callerSignal ? AbortSignal.any([this.signal, callerSignal]) : this.signal;

    const request = input instanceof Request
      ? new Request(input, { ...requestInit, signal })
      : new Request(new URL(input, this.#contextUrl), { ...requestInit, signal });
    const initiatorRecord = initiator instanceof Response ? responseMeta(initiator).record : initiator;
    const referrer = referrerFor(initiatorRecord, givenReferrer);
    // Only a file: document can refer to a file: URL, whatever answers it, so
    // it's checked before the registry is asked
    const referenceRefusal = canRefer(request.url, referrer) ? undefined : refusedReference(request.url, /** @type string */ (referrer));
    // The registry's documents aren't fetched, so they're answered before
    // `allowRetrieval`. What it throws is recorded, like a failed fetch.
    let registered;
    let registryError;
    if (!referenceRefusal) {
      try {
        registered = await this.#registered(request, referrer);
      } catch (error) {
        registryError = error;
      }
    }
    // A refused URL gets none of the session's headers, but it's recorded, like
    // a request a browser blocks
    const refusal = referenceRefusal ?? (registered || registryError ? undefined : await this.#allowRetrievalRefusal(request.url));
    const added = registered || registryError || refusal ? new Headers() : await this.#policy.headers(request.url);
    signal.throwIfAborted();

    const record = startRecord({
      url: request.url,
      method: request.method,
      initiator: initiatorRecord,
      referrer,
      session: this,
      priority: priority instanceof PrioritySignal ? priority.value : priority ?? "auto",
      requestHeaders: [...sentHeaders(request.headers, added)],
      notify: (event) => this.#notify(event)
    });

    /** @type FetchContext */
    const ctx = {
      session: this,
      cacheMode: cache ?? "default",
      priority: priority instanceof PrioritySignal ? priority : PrioritySignal.of(priority ?? "auto"),
      record
    };

    this.#notify({ type: "start", record });
    let response;
    try {
      if (registryError) {
        throw registryError;
      } else if (refusal) {
        throw refusal;
      }
      response = registered ?? await follow(this.stack, request, ctx, this.#policy, added);
    } catch (error) {
      recordEnd(record, error);
      throw error;
    }
    // A response that was made, not fetched, has no URL, because the
    // `Response` constructor can't set one. A fetched response always has
    // one, without its fragment.
    if (!response.url) {
      const url = new URL(request.url);
      url.hash = "";
      withUrl(response, url.href);
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

  /** @type API.Hyperjump["observe"] */
  observe(observer, options = {}) {
    this.#observers.set(observer, { bodies: options.bodies ?? false });
    return () => {
      this.#observers.delete(observer);
    };
  }

  /** @type API.Hyperjump["close"] */
  close(reason = new DOMException("The session was closed", "AbortError")) {
    this.#controller.abort(reason);
  }

  /**
   * What the registry has for a request, if it has one. Only a `GET` or a
   * `HEAD` is asked of it, without the URL's fragment. A response whose URL
   * is another one, like a file, is checked like a fetched response's: the
   * document the request comes from has to be able to refer to it.
   *
   * @type (request: Request, referrer: string | undefined) => Promise<Response | undefined>
   */
  async #registered(request, referrer) {
    const registry = this.config.registry;
    if (registry === undefined || (request.method !== "GET" && request.method !== "HEAD")) {
      return;
    }

    const url = new URL(request.url);
    url.hash = "";
    const response = await registry.get(url.href, { session: /** @type any */ (this) });
    if (response === undefined) {
      return;
    }
    if (response.url && !canRefer(response.url, referrer)) {
      await response.body?.cancel().catch(() => {});
      throw refusedReferenceResponse(request.url, response.url, /** @type string */ (referrer));
    }
    return setResponseMeta(response, { source: "registry" });
  }

  /**
   * Why `allowRetrieval` doesn't allow a URL, if it doesn't
   *
   * @type (url: string) => Promise<TypeError | undefined>
   */
  async #allowRetrievalRefusal(url) {
    return await this.#allows(url) ? undefined : refused(url);
  }

  /**
   * Whether `allowRetrieval` allows a URL
   *
   * @type (url: string) => Promise<boolean>
   */
  async #allows(url) {
    if (this.#allowRetrieval instanceof TypeError) {
      throw this.#allowRetrieval;
    }
    this.#realEntries ??= realEntries(this.#allowRetrieval);
    return allows(await this.#realEntries, url);
  }

  /** Whether anyone is watching, and whether any of them want bodies */
  #watching() {
    const watchers = [...this.#observers.values()];
    return { observed: watchers.length > 0, bodies: watchers.some((options) => options.bodies) };
  }

  /**
   * Tell the observers. An observer that throws doesn't stop the request or
   * the other observers.
   *
   * @param {TraceEvent} event
   */
  #notify(event) {
    for (const observer of this.#observers.keys()) {
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
