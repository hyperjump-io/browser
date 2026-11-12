import type { Session } from "./session.d.ts";
import type { ResponseMeta } from "./response-meta.d.ts";

/** Something a layer did with a request, and when */
export type Mark = {
  name: string;

  /** Milliseconds, from `performance.now()` */
  time: number;

  detail?: unknown;
};

/** What a session tells its observers (see {@link Session.observe}) */
export type TraceEvent = { type: "start" | "response" | "end"; record: FetchRecord } | { type: "mark"; record: FetchRecord; mark: Mark };

export type Observer = (event: TraceEvent) => void;

/**
 * Everything known about one {@link Session.fetch}: what was asked for, what
 * caused it, what each layer did with it, and how it ended. A response has
 * its record as `responseMeta(response).record`, and a layer has it as
 * `ctx.record`. A record is made by the session.
 */
export class FetchRecord {
  /** Unique in the process, in the order requests started */
  readonly id: number;
  readonly url: string;
  readonly method: string;

  /** The request that caused this one, like the document that referred to it */
  readonly initiator: FetchRecord | undefined;
  readonly session: Session;

  /** Milliseconds, from `performance.now()` */
  readonly startTime: number;

  /** The priority the caller asked for. The one that was used is on the `"network:start"` mark. */
  readonly priority: string;

  /** The request's headers as it went into the stack, with the session's */
  readonly requestHeaders: readonly [string, string][];

  /** What the layers did, in order. Each built-in layer's marks start with its name, like `"scheduler:queued"`. */
  readonly marks: readonly Mark[];

  /** When the response arrived */
  readonly responseTime: number | undefined;

  /** When the body was done, or the request failed. It's known only while the session is observed. */
  readonly endTime: number | undefined;

  readonly status: number | undefined;
  readonly statusText: string | undefined;
  readonly responseHeaders: readonly [string, string][] | undefined;

  /** The response's URL, after redirects */
  readonly finalUrl: string | undefined;

  /** Where the response came from (`responseMeta(response).source`) */
  readonly source: string | undefined;

  /** What the HTTP cache did (`responseMeta(response).cache`) */
  readonly cache: ResponseMeta["cache"];

  /** The body's size in bytes, once it's done. It's known only while the session is observed. */
  readonly bodySize: number | undefined;

  /** The body, if an observer asked for bodies */
  readonly body: Uint8Array | undefined;

  readonly error: unknown;

  /** Say what a layer did with the request */
  mark(name: string, detail?: unknown): void;

  /** The record as data, for logging or saving */
  toJSON(): FetchRecordJson;
}

export type FetchRecordJson = {
  id: number;
  url: string;
  method: string;
  initiator: number | undefined;
  startTime: number;
  responseTime: number | undefined;
  endTime: number | undefined;
  status: number | undefined;
  finalUrl: string | undefined;
  source: string | undefined;
  cache: ResponseMeta["cache"];
  error: string | undefined;
  marks: { name: string; time: number }[];
};

/**
 * Start a record. It's for {@link Session.fetch}, which tells observers
 * through `notify`.
 *
 * @internal
 */
export const startRecord: (init: {
  url: string;
  method: string;
  initiator: FetchRecord | undefined;
  session: Session;
  priority: string;
  requestHeaders: [string, string][];
  notify: Observer;
}) => FetchRecord;

/** @internal */
export const recordResponse: (record: FetchRecord, response: Response) => void;

/** @internal */
export const recordChunk: (record: FetchRecord, chunk: Uint8Array, keep: boolean) => void;

/** @internal */
export const recordEnd: (record: FetchRecord, error?: unknown) => void;
