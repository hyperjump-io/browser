/**
 * @import * as API from "./priority.d.ts"
 */

/** @type typeof API.priorityRank */
export const priorityRank = Object.freeze({ high: 0, auto: 1, low: 2 });

/**
 * How a controller changes its signal. Only this module has them, so only a
 * controller can change a signal.
 *
 * @type WeakMap<PrioritySignal, (value: API.Priority) => void>
 */
const setters = new WeakMap();

/** @implements API.PrioritySignal */
export class PrioritySignal extends EventTarget {
  /** @type API.Priority */
  #value;

  /** @param {API.Priority} value */
  constructor(value) {
    super();
    this.#value = value;
    setters.set(this, (next) => {
      if (this.#value !== next) {
        this.#value = next;
        this.dispatchEvent(new Event("change"));
      }
    });
  }

  get value() {
    return this.#value;
  }

  /** @type (value: API.Priority) => PrioritySignal */
  static of(value) {
    return new PrioritySignal(value);
  }
}

/** @implements API.PriorityController */
export class PriorityController {
  /** @type PrioritySignal */
  #signal;

  /** @param {API.Priority} [initial] */
  constructor(initial = "auto") {
    this.#signal = new PrioritySignal(initial);
  }

  get signal() {
    return this.#signal;
  }

  /** @type API.PriorityController["set"] */
  set(value) {
    /** @type NonNullable<ReturnType<typeof setters.get>> */ (setters.get(this.#signal))(value);
  }
}

/** @implements API.PriorityGroup */
export class PriorityGroup {
  #controller = new PriorityController("low");

  /**
   * Members, with how many times each was added, so the same signal can be a
   * member more than once
   *
   * @type Map<API.PrioritySignal, number>
   */
  #members = new Map();

  #onChange = () => this.#update();

  get signal() {
    return this.#controller.signal;
  }

  /** @type API.PriorityGroup["add"] */
  add(member) {
    const count = this.#members.get(member) ?? 0;
    this.#members.set(member, count + 1);
    if (count === 0) {
      member.addEventListener("change", this.#onChange);
    }
    this.#update();

    let removed = false;
    return () => {
      if (removed) {
        return;
      }
      removed = true;
      const remaining = /** @type number */ (this.#members.get(member)) - 1;
      if (remaining === 0) {
        this.#members.delete(member);
        member.removeEventListener("change", this.#onChange);
      } else {
        this.#members.set(member, remaining);
      }
      this.#update();
    };
  }

  #update() {
    // With no members left, nobody is waiting, so the last value is kept
    if (this.#members.size === 0) {
      return;
    }

    /** @type API.Priority */
    let best = "low";
    for (const member of this.#members.keys()) {
      if (priorityRank[member.value] < priorityRank[best]) {
        best = member.value;
      }
    }
    this.#controller.set(best);
  }
}
