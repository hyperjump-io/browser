import { trackBody } from "../response-meta.js";
import { priorityRank } from "../priority.js";
import { enqueue } from "./queue.js";

/**
 * @import * as API from "./scheduler.d.ts"
 * @import { FetchContext, Fetcher } from "../layers.d.ts"
 * @import { Waiter } from "./queue.js"
 */

/** @typedef {Waiter<void> & { key: string }} KeyedWaiter */

/** @implements API.Scheduler */
export class Scheduler {
  /** @type (key: string) => number */
  #perKey;

  /** @type number */
  #total;

  /** @type NonNullable<API.SchedulerOptions["key"]> */
  #key;

  /** @type {"body" | "headers"} */
  #releaseOn;

  /** @type Map<string, number> */
  #active = new Map();

  #activeTotal = 0;

  /**
   * Waiting requests, in the order they start
   *
   * @type KeyedWaiter[]
   */
  #queue = [];

  #seq = 0;

  /**
   * @param {Fetcher} inner
   * @param {API.SchedulerOptions} [options]
   */
  constructor(inner, options = {}) {
    this.inner = inner;
    const perKey = options.perKey ?? 6;
    this.#perKey = typeof perKey === "function" ? perKey : () => perKey;
    this.#total = options.total ?? 256;
    this.#key = options.key ?? defaultKey;
    this.#releaseOn = options.releaseOn ?? "body";
  }

  /** @type API.Scheduler["stats"] */
  stats() {
    /** @type API.SchedulerStats["byKey"] */
    const byKey = {};
    for (const [key, active] of this.#active) {
      byKey[key] = { active, queued: 0 };
    }
    for (const waiter of this.#queue) {
      byKey[waiter.key] ??= { active: 0, queued: 0 };
      byKey[waiter.key].queued++;
    }
    return { active: this.#activeTotal, queued: this.#queue.length, byKey };
  }

  /** @type API.Scheduler["fetch"] */
  async fetch(request, ctx) {
    const key = this.#key(request, ctx);
    if (key === undefined) {
      return this.inner.fetch(request, ctx);
    }

    await this.#acquire(key, request.signal, ctx);
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        this.#release(key);
      }
    };

    let response;
    try {
      response = await this.inner.fetch(request, ctx);
    } catch (error) {
      release();
      throw error;
    }
    if (this.#releaseOn === "headers") {
      release();
      return response;
    }
    return trackBody(response, release);
  }

  /** @type (key: string) => boolean */
  #runnable(key) {
    return this.#activeTotal < this.#total && (this.#active.get(key) ?? 0) < this.#perKey(key);
  }

  /** @type (key: string) => void */
  #take(key) {
    this.#activeTotal++;
    this.#active.set(key, (this.#active.get(key) ?? 0) + 1);
  }

  /** @type (key: string, signal: AbortSignal, ctx: FetchContext) => Promise<void> */
  #acquire(key, signal, ctx) {
    const { priority, record } = ctx;
    if (signal.aborted) {
      return Promise.reject(/** @type unknown */ (signal.reason));
    }
    // Every waiting request is blocked, because a release starts every one
    // that can, so one that can run now isn't jumping ahead of one that could
    if (this.#runnable(key)) {
      this.#take(key);
      return Promise.resolve();
    }

    record.mark("scheduler:queued", { key, ahead: this.#queue.length });
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        signal.removeEventListener("abort", onAbort);
        priority.removeEventListener("change", onPriority);
      };
      /** @type KeyedWaiter */
      const waiter = {
        key,
        rank: priorityRank[priority.value],
        seq: this.#seq++,
        start: () => {
          cleanup();
          record.mark("scheduler:start", { key });
          resolve();
        }
      };
      const remove = () => {
        this.#queue = this.#queue.filter((other) => other !== waiter);
      };
      const onAbort = () => {
        cleanup();
        remove();
        reject(/** @type unknown */ (signal.reason));
      };
      const onPriority = () => {
        remove();
        waiter.rank = priorityRank[priority.value];
        enqueue(this.#queue, waiter);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      priority.addEventListener("change", onPriority);
      enqueue(this.#queue, waiter);
    });
  }

  /** @type (key: string) => void */
  #release(key) {
    this.#activeTotal--;
    const remaining = (this.#active.get(key) ?? 1) - 1;
    if (remaining === 0) {
      this.#active.delete(key);
    } else {
      this.#active.set(key, remaining);
    }
    this.#pump();
  }

  /** Start every waiting request that can run, the most urgent first */
  #pump() {
    for (let index = 0; index < this.#queue.length && this.#activeTotal < this.#total;) {
      const waiter = this.#queue[index];
      if (this.#runnable(waiter.key)) {
        this.#queue.splice(index, 1);
        this.#take(waiter.key);
        waiter.start();
      } else {
        index++;
      }
    }
  }
}

/** @type typeof API.scheduler */
export const scheduler = (options) => (inner) => new Scheduler(inner, options);

/** @type NonNullable<API.SchedulerOptions["key"]> */
const defaultKey = (request) => {
  const url = new URL(request.url);
  return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
};
