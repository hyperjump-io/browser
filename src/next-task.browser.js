/**
 * A promise that's settled in a task after this one, so timers, events, and
 * an abort that's waiting can happen first. A browser has no
 * `setImmediate`, and a `setTimeout` that's nested waits at least 4 ms, so
 * it's a message to a port, which is a task without a delay.
 * `scheduler.yield` isn't in every browser this runs in.
 *
 * @type () => Promise<void>
 */
export const nextTask = () => new Promise((resolve) => {
  const { port1, port2 } = new MessageChannel();
  port1.onmessage = () => {
    port1.close();
    resolve();
  };
  port2.postMessage(undefined);
});
