import type { Hyperjump } from "./hyperjump.d.ts";
import type { FetchRecord, FetchRecordJson } from "./fetch-record.d.ts";
import type { Har, HarOptions } from "./har.d.ts";

export type TraceOptions = {
  /** Keep response bodies. Default `false`. */
  bodies?: boolean;
};

/**
 * Records what a session fetches, like a network panel in devtools. `waterfall()` draws it as text.
 */
export class Trace {
  constructor(session: Hyperjump, options?: TraceOptions);

  readonly session: Hyperjump;

  /** The records, in the order the requests started */
  readonly records: readonly FetchRecord[];

  /** Stop recording new requests */
  stop(): void;

  /** The records in tree order: each one followed by the requests it initiated */
  tree(): { record: FetchRecord; depth: number }[];

  /**
   * One row for each request, under the one that initiated it, with a bar
   * for when it waited in a queue (░) and loaded (█)
   */
  waterfall(options?: { width?: number; urlWidth?: number }): string;

  toJSON(): FetchRecordJson[];

  /** The trace as a HAR 1.2 log, which browser devtools open (see {@link toHar}) */
  toHar(options?: HarOptions): Har;
}
