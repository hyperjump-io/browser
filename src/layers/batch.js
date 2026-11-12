import { PriorityGroup } from "../priority.js";

/**
 * @import * as API from "./batch.d.ts"
 * @import { FetchContext, Fetcher } from "../layers.d.ts"
 */

/**
 * @typedef {{
 *   request: Request;
 *   resolve: (response: Response) => void;
 *   reject: (error: unknown) => void;
 *   done: () => void;
 *   aborted: boolean;
 * }} Member
 *
 * @typedef {{
 *   members: Member[];
 *   ctx: FetchContext;
 *   priority: PriorityGroup;
 *   timer?: ReturnType<typeof setTimeout>;
 * }} Pending
 */

/** @implements API.Batch */
export class Batch {
  /** @type API.BatchOptions */
  #options;

  /** @type {"session" | "root"} */
  #scope;

  /**
   * @param {Fetcher} inner
   * @param {API.BatchOptions} options
   */
  constructor(inner, options) {
    this.inner = inner;
    this.#options = options;
    this.#scope = options.scope ?? "session";
  }

  /** @type API.Batch["fetch"] */
  fetch(request, ctx) {
    const key = this.#options.match(request, ctx);
    if (key === undefined) {
      return this.inner.fetch(request, ctx);
    }
    const { signal } = request;
    if (signal.aborted) {
      return Promise.reject(/** @type unknown */ (signal.reason));
    }

    const owner = this.#scope === "root" ? ctx.session.root : ctx.session;
    /** @type Map<string, Pending> */
    const queues = owner.state(this, () => new Map());
    let pending = queues.get(key);
    if (!pending) {
      const priority = new PriorityGroup();
      /** @type Pending */
      const created = {
        members: [],
        // The batch belongs to its scope, not to the caller that came first
        ctx: { ...ctx, session: owner, priority: priority.signal },
        priority
      };
      created.timer = setTimeout(() => this.#flush(queues, key, created), this.#options.windowMs ?? 0);
      queues.set(key, created);
      pending = created;
    }
    const batch = pending;

    /** @type Promise<Response> */
    const promise = new Promise((resolve, reject) => {
      const leave = batch.priority.add(ctx.priority);
      /** @type Member */
      const member = {
        request,
        resolve,
        reject,
        aborted: false,
        done: () => {
          signal.removeEventListener("abort", onAbort);
          leave();
        }
      };
      const onAbort = () => {
        member.aborted = true;
        member.done();
        reject(/** @type unknown */ (signal.reason));
        // Not sent yet, so it's taken out of the batch
        const index = batch.members.indexOf(member);
        if (queues.get(key) === batch && index !== -1) {
          batch.members.splice(index, 1);
          if (batch.members.length === 0) {
            clearTimeout(batch.timer);
            queues.delete(key);
          }
        }
      };
      signal.addEventListener("abort", onAbort, { once: true });
      ctx.record.mark("batch:queued", { key, position: batch.members.length });
      batch.members.push(member);
    });

    if (this.#options.maxSize !== undefined && batch.members.length >= this.#options.maxSize) {
      this.#flush(queues, key, batch);
    }
    return promise;
  }

  /** @type (queues: Map<string, Pending>, key: string, batch: Pending) => void */
  #flush(queues, key, batch) {
    clearTimeout(batch.timer);
    if (queues.get(key) !== batch) {
      return;
    }
    queues.delete(key);
    const members = [...batch.members];

    /** @type (fn: (member: Member, index: number) => void) => void */
    const settle = (fn) => {
      for (const [index, member] of members.entries()) {
        if (!member.aborted) {
          member.done();
          fn(member, index);
        }
      }
    };

    this.#options.execute(members.map((member) => member.request), this.inner, batch.ctx)
      .then((responses) => {
        if (responses.length !== members.length) {
          const error = Error(`The batch's execute returned ${responses.length} responses for ${members.length} requests`);
          settle((member) => member.reject(error));
          return;
        }
        // A caller that gave up after the batch was sent doesn't need its response
        for (const [index, member] of members.entries()) {
          if (member.aborted) {
            responses[index].body?.cancel().catch(() => {});
          }
        }
        settle((member, index) => member.resolve(responses[index]));
      }, (/** @type unknown */ error) => settle((member) => member.reject(error)));
  }
}

/** @type typeof API.batch */
export const batch = (options) => (inner) => new Batch(inner, options);
