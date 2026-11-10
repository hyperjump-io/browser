import type { Session } from "./session.d.ts";
import type { FetchRecord, FetchRecordJson } from "./fetch-record.d.ts";

export type TraceOptions = {
  /** Record the requests of the session's children too. Default `true`. */
  children?: boolean;

  /** Keep response bodies. Default `false`. */
  bodies?: boolean;
};

/**
 * Records what a session and its children fetch, like a network panel in
 * devtools. `waterfall()` draws it as text.
 */
export class Trace {
  constructor(session: Session, options?: TraceOptions);

  readonly session: Session;

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
}
