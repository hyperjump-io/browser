import { trackBody } from "../response-meta.js";
import { priorityRank } from "../priority.js";
import { enqueue } from "./queue.js";

/**
 * @import * as API from "./throttle.d.ts"
 * @import { FetchContext, Fetcher } from "../layers.d.ts"
 * @import { Session } from "../session.d.ts"
 * @import { Waiter } from "./queue.js"
 */

/**
 * @typedef {"important" | "delayable"} Kind
 * @typedef {{ important: number, delayable: number, queue: Waiter<Kind>[] }} Page
 */

/** @implements API.Throttle */
export class Throttle {
  /** @type number */
  #maxDelayable;

  /** @type number */
  #maxWhileBusy;

  /** @type NonNullable<API.ThrottleOptions["isDelayable"]> */
  #isDelayable;

  /** @type {"root" | "session"} */
  #scope;

  /** @type {"body" | "headers"} */
  #releaseOn;

  #seq = 0;

  /**
   * @param {Fetcher} inner
   * @param {API.ThrottleOptions} [options]
   */
  constructor(inner, options = {}) {
    this.inner = inner;
    this.#maxDelayable = options.maxDelayable ?? 10;
    this.#maxWhileBusy = options.maxDelayableWhileBusy ?? 1;
    this.#isDelayable = options.isDelayable ?? ((_request, ctx) => ctx.priority.value === "low");
    this.#scope = options.scope ?? "root";
    this.#releaseOn = options.releaseOn ?? "body";
  }

  /** @type API.Throttle["stats"] */
  stats(session) {
    const page = this.#page(session);
    return { important: page.important, delayable: page.delayable, queued: page.queue.length };
  }

  /** @type API.Throttle["fetch"] */
  async fetch(request, ctx) {
    const page = this.#page(ctx.session);
    const kind = this.#isDelayable(request, ctx) ? await this.#acquire(page, request, ctx) : this.#start(page, "important");

    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        page[kind]--;
        this.#pump(page);
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

  /** @type (session: Session) => Page */
  #page(session) {
    const owner = this.#scope === "root" ? session.root : session;
    return owner.state(this, () => ({ important: 0, delayable: 0, queue: [] }));
  }

  /** @type (page: Page) => number */
  #limit(page) {
    return page.important > 0 ? this.#maxWhileBusy : this.#maxDelayable;
  }

  /** @type (page: Page, kind: Kind) => Kind */
  #start(page, kind) {
    page[kind]++;
    return kind;
  }

  /** @type (page: Page, request: Request, ctx: FetchContext) => Promise<Kind> */
  #acquire(page, request, ctx) {
    const { signal } = request;
    const { priority, record } = ctx;
    if (signal.aborted) {
      return Promise.reject(/** @type unknown */ (signal.reason));
    }
    if (page.queue.length === 0 && page.delayable < this.#limit(page)) {
      return Promise.resolve(this.#start(page, "delayable"));
    }

    record.mark("throttle:held", { delayable: page.delayable, important: page.important });
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        signal.removeEventListener("abort", onAbort);
        priority.removeEventListener("change", onPriority);
      };
      /** @type Waiter<Kind> */
      const waiter = {
        rank: priorityRank[priority.value],
        seq: this.#seq++,
        start: (kind) => {
          cleanup();
          record.mark("throttle:released", { as: kind });
          resolve(this.#start(page, kind));
        }
      };
      const remove = () => {
        page.queue = page.queue.filter((other) => other !== waiter);
      };
      const onAbort = () => {
        cleanup();
        remove();
        reject(/** @type unknown */ (signal.reason));
      };
      const onPriority = () => {
        remove();
        if (!this.#isDelayable(request, ctx)) {
          // It isn't delayable any more, so it starts now
          waiter.start("important");
          return;
        }
        waiter.rank = priorityRank[priority.value];
        enqueue(page.queue, waiter);
        this.#pump(page);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      priority.addEventListener("change", onPriority);
      enqueue(page.queue, waiter);
    });
  }

  /** @type (page: Page) => void */
  #pump(page) {
    while (page.queue.length > 0 && page.delayable < this.#limit(page)) {
      /** @type Waiter<Kind> */ (page.queue.shift()).start("delayable");
    }
  }
}

/** @type typeof API.throttle */
export const throttle = (options) => (inner) => new Throttle(inner, options);
