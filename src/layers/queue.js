/**
 * A request waiting for a slot. `rank` is its priority's, and `seq` the order
 * it came in.
 *
 * @template T
 * @typedef {{ rank: number, seq: number, start: (value: T) => void }} Waiter
 */

/**
 * Put a waiter in a queue sorted by rank, then by seq, so one whose priority
 * changed keeps its place among its new peers
 *
 * @template T
 * @param {Waiter<T>[]} queue
 * @param {Waiter<T>} waiter
 */
export const enqueue = (queue, waiter) => {
  const index = queue.findIndex((other) => other.rank > waiter.rank || (other.rank === waiter.rank && other.seq > waiter.seq));
  queue.splice(index === -1 ? queue.length : index, 0, waiter);
};
