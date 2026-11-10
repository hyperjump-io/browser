/**
 * @import { FetchRecord } from "./fetch-record.d.ts"
 */

/**
 * When a request stopped waiting in a queue, the throttle's or the
 * scheduler's, if it waited: when it first reached the transport, or, if it
 * never did, when a queue last let it go. Later steps of a redirect aren't
 * waiting.
 *
 * @type (record: FetchRecord) => number | undefined
 */
export const waitingUntil = (record) => {
  const queued = record.marks.some((mark) => mark.name === "throttle:held" || mark.name === "scheduler:queued");
  if (!queued) {
    return undefined;
  }
  const reached = record.marks.find((mark) => mark.name === "network:start" || mark.name === "file:read");
  if (reached) {
    return reached.time;
  }
  let until;
  for (const mark of record.marks) {
    if (mark.name === "throttle:released" || mark.name === "scheduler:start") {
      until = mark.time;
    }
  }
  return until;
};
