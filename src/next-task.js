/**
 * A promise that's settled in a task after this one, so timers, I/O, and
 * an abort that's waiting can happen first. A promise that's already
 * settled is a microtask, which runs before any of them.
 *
 * @type () => Promise<void>
 */
export const nextTask = () => new Promise((resolve) => {
  setImmediate(resolve);
});
