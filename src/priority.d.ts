/** A request's priority, like `fetchpriority` in browsers */
export type Priority = "high" | "auto" | "low";

/** The order priorities are served in: `high`, then `auto`, then `low` */
export const priorityRank: Readonly<Record<Priority, number>>;

/**
 * A request's priority, which can change while the request waits, the way a
 * browser raises an image's priority when it scrolls into view. It's like an
 * `AbortSignal`: whoever has the {@link PriorityController} changes it, and
 * layers read `value` and listen for `"change"`.
 */
export class PrioritySignal extends EventTarget {
  /** Use a {@link PriorityController}, or {@link PrioritySignal.of} for one that doesn't change */
  constructor(value: Priority);

  get value(): Priority;

  /** A signal that never changes */
  static of(value: Priority): PrioritySignal;
}

/** Changes a {@link PrioritySignal} */
export class PriorityController {
  constructor(initial?: Priority);

  readonly signal: PrioritySignal;

  /** Change the priority. A `"change"` event is dispatched if it's different. */
  set(value: Priority): void;
}

/**
 * The priority of several requests that share one underlying request, like
 * ones dedupe or batching combine: the most urgent of its members'. When a
 * member leaves, it's the most urgent of the rest. With no members, it keeps
 * its last value.
 */
export class PriorityGroup {
  get signal(): PrioritySignal;

  /** Add a member. Returns a function that removes it. */
  add(member: PrioritySignal): () => void;
}
