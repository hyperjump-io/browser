import { PriorityController } from "../priority.js";

/**
 * @import * as API from "./destination-priority.d.ts"
 * @import { Fetcher } from "../layers.d.ts"
 * @import { Priority } from "../priority.d.ts"
 */

/** @type typeof API.defaultDestinationPriorities */
export const defaultDestinationPriorities = Object.freeze({
  document: "high",
  style: "high",
  font: "high",
  image: "low",
  audio: "low",
  video: "low",
  track: "low"
});

/** @implements API.DestinationPriority */
export class DestinationPriority {
  /**
   * @param {Fetcher} inner
   * @param {Record<string, Priority>} [priorities]
   */
  constructor(inner, priorities = defaultDestinationPriorities) {
    this.inner = inner;
    this.priorities = Object.freeze({ ...priorities });
  }

  /** @type API.DestinationPriority["fetch"] */
  async fetch(request, ctx) {
    const mapped = Object.hasOwn(this.priorities, ctx.destination) ? this.priorities[ctx.destination] : undefined;
    if (mapped === undefined || ctx.priority.value !== "auto") {
      return this.inner.fetch(request, ctx);
    }

    // It follows the caller's priority if the caller changes it later
    const original = ctx.priority;
    const derived = new PriorityController(mapped);
    const follow = () => derived.set(original.value === "auto" ? mapped : original.value);
    original.addEventListener("change", follow);
    ctx.record.mark("priority:default", { priority: mapped, destination: ctx.destination });
    try {
      return await this.inner.fetch(request, { ...ctx, priority: derived.signal });
    } finally {
      original.removeEventListener("change", follow);
    }
  }
}

/** @type typeof API.destinationPriority */
export const destinationPriority = (priorities) => (inner) => new DestinationPriority(inner, priorities);
