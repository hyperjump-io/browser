import { cloneResponse } from "../response-meta.js";
import { PriorityGroup } from "../priority.js";

/**
 * @import * as API from "./dedupe.d.ts"
 * @import { FetchContext, Fetcher } from "../layers.d.ts"
 * @import { FetchRecord } from "../fetch-record.d.ts"
 * @import { Session } from "../session.d.ts"
 */

/**
 * @typedef {{
 *   record: FetchRecord;
 *   promise: Promise<Response>;
 *   consumers: number;
 *   priority: PriorityGroup;
 *   controller: AbortController;
 *   settled: boolean;
 * }} InFlight
 */

/** @implements API.Dedupe */
export class Dedupe {
  /** @type NonNullable<API.DedupeOptions["key"]> */
  #key;

  /** @type {"session" | "root"} */
  #scope;

  /**
   * @param {Fetcher} inner
   * @param {API.DedupeOptions} [options]
   */
  constructor(inner, options = {}) {
    this.inner = inner;
    this.#key = options.key ?? defaultKey;
    this.#scope = options.scope ?? "session";
  }

  /** @type API.Dedupe["inFlight"] */
  inFlight(session) {
    return this.#inFlight(this.#owner(session)).size;
  }

  /** @type API.Dedupe["fetch"] */
  async fetch(request, ctx) {
    const key = this.#key(request, ctx);
    if (key === undefined) {
      return this.inner.fetch(request, ctx);
    }

    const owner = this.#owner(ctx.session);
    const inFlight = this.#inFlight(owner);
    const entry = inFlight.get(key) ?? this.#start(request, ctx, owner, inFlight, key);

    if (entry.record !== ctx.record) {
      ctx.record.mark("dedupe:joined", { request: entry.record.id });
    }
    entry.consumers++;
    const leave = entry.priority.add(ctx.priority);
    try {
      return cloneResponse(await abortable(entry.promise, ctx.signal));
    } finally {
      leave();
      if (--entry.consumers === 0) {
        if (entry.settled) {
          // Everyone has a copy, so the original's part of the tee is let go
          entry.promise.then((response) => response.body?.cancel().catch(() => {}), () => {});
        } else {
          // Nobody wants it any more, so it's stopped, and nobody new joins it
          if (inFlight.get(key) === entry) {
            inFlight.delete(key);
          }
          entry.controller.abort(new DOMException("Every caller gave up", "AbortError"));
        }
      }
    }
  }

  /**
   * Start the shared request. It belongs to the scope that tracks it: its
   * session and signal, with the priority of the callers waiting for it.
   *
   * @type (request: Request, ctx: FetchContext, owner: Session, inFlight: Map<string, InFlight>, key: string) => InFlight
   */
  #start(request, ctx, owner, inFlight, key) {
    const controller = new AbortController();
    const signal = AbortSignal.any([owner.signal, controller.signal]);
    const priority = new PriorityGroup();
    /** @type FetchContext */
    const sharedCtx = { ...ctx, session: owner, signal, priority: priority.signal };

    /** @type InFlight */
    const entry = {
      record: ctx.record,
      consumers: 0,
      priority,
      controller,
      settled: false,
      // It starts after this turn, so the first caller's priority is in the group
      promise: Promise.resolve()
        .then(() => this.inner.fetch(new Request(request, { signal }), sharedCtx))
        .finally(() => {
          entry.settled = true;
          if (inFlight.get(key) === entry) {
            inFlight.delete(key);
          }
        })
    };
    // Each caller sees an error through its own wait
    entry.promise.catch(() => {});
    inFlight.set(key, entry);
    return entry;
  }

  /** @type (session: Session) => Session */
  #owner(session) {
    return this.#scope === "root" ? session.root : session;
  }

  /** @type (owner: Session) => Map<string, InFlight> */
  #inFlight(owner) {
    return owner.state(this, () => new Map());
  }
}

/** @type typeof API.dedupe */
export const dedupe = (options) => (inner) => new Dedupe(inner, options);

/** @type NonNullable<API.DedupeOptions["key"]> */
const defaultKey = (request, ctx) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return undefined;
  }
  const headers = [...request.headers].map(([name, value]) => `${name}:${value}`).join("\n");
  return `${request.method} ${request.url} ${ctx.cacheMode}\n${headers}`;
};

/**
 * A promise that rejects when the signal aborts, for one caller's wait
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {AbortSignal} signal
 * @returns {Promise<T>}
 */
const abortable = (promise, signal) => {
  if (signal.aborted) {
    return Promise.reject(/** @type unknown */ (signal.reason));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(/** @type unknown */ (signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
};
