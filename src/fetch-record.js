import { responseMeta } from "./response-meta.js";

/**
 * @import * as API from "./fetch-record.d.ts"
 * @import { Hyperjump } from "./hyperjump.d.ts"
 */

/**
 * What a record says about its response, which the session writes and
 * everyone else reads
 *
 * @typedef {{
 *   responseTime?: number;
 *   endTime?: number;
 *   status?: number;
 *   statusText?: string;
 *   responseHeaders?: [string, string][];
 *   finalUrl?: string;
 *   source?: string;
 *   cache?: import("./response-meta.d.ts").ResponseMeta["cache"];
 *   bodySize?: number;
 *   chunks?: Uint8Array[];
 *   error?: unknown;
 * }} RecordState
 */

/** @type WeakMap<API.FetchRecord, { state: RecordState, notify: API.Observer, marks: API.Mark[] }> */
const writers = new WeakMap();

let nextId = 1;

/** @implements API.FetchRecord */
export class FetchRecord {
  /** @type RecordState */
  #state = {};

  /** @type API.Mark[] */
  #marks = [];

  /** @type API.Observer */
  #notify;

  /**
   * @param {Parameters<typeof API.startRecord>[0]} init
   */
  constructor(init) {
    this.id = nextId++;
    this.url = init.url;
    this.method = init.method;
    this.initiator = init.initiator;
    this.referrer = init.referrer;
    /** @type Hyperjump */
    this.session = init.session;
    this.priority = init.priority;
    this.requestHeaders = init.requestHeaders;
    this.startTime = performance.now();
    this.#notify = init.notify;
    writers.set(this, { state: this.#state, notify: init.notify, marks: this.#marks });
  }

  get marks() {
    return this.#marks;
  }

  get responseTime() {
    return this.#state.responseTime;
  }

  get endTime() {
    return this.#state.endTime;
  }

  get status() {
    return this.#state.status;
  }

  get statusText() {
    return this.#state.statusText;
  }

  get responseHeaders() {
    return this.#state.responseHeaders;
  }

  get finalUrl() {
    return this.#state.finalUrl;
  }

  get source() {
    return this.#state.source;
  }

  get cache() {
    return this.#state.cache;
  }

  get bodySize() {
    return this.#state.bodySize;
  }

  /**
   * The chunks kept so far, joined when they're read, and kept joined. A
   * chunk is only kept as it comes, because joining every chunk to the ones
   * before it would copy the body again for each one.
   */
  get body() {
    const { chunks } = this.#state;
    if (chunks && chunks.length > 1) {
      const joined = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.byteLength, 0));
      let offset = 0;
      for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      chunks.splice(0, chunks.length, joined);
    }
    return chunks?.[0];
  }

  get error() {
    return this.#state.error;
  }

  /** @type API.FetchRecord["mark"] */
  mark(name, detail) {
    /** @type API.Mark */
    const mark = { name, time: performance.now(), detail };
    this.#marks.push(mark);
    this.#notify({ type: "mark", record: this, mark });
  }

  /** @type API.FetchRecord["toJSON"] */
  toJSON() {
    return {
      id: this.id,
      url: this.url,
      method: this.method,
      initiator: this.initiator?.id,
      referrer: this.referrer,
      startTime: this.startTime,
      responseTime: this.responseTime,
      endTime: this.endTime,
      status: this.status,
      finalUrl: this.finalUrl,
      source: this.source,
      cache: this.cache,
      error: this.error === undefined ? undefined : errorText(this.error),
      marks: this.#marks.map((mark) => ({ name: mark.name, time: mark.time }))
    };
  }
}

/** @type typeof API.startRecord */
export const startRecord = (init) => new FetchRecord(init);

/** @type typeof API.recordResponse */
export const recordResponse = (record, response) => {
  const { state, notify } = writerOf(record);
  state.responseTime = performance.now();
  state.status = response.status;
  state.statusText = response.statusText;
  state.responseHeaders = [...response.headers];
  state.finalUrl = response.url || record.url;
  state.source = responseMeta(response).source;
  state.cache = responseMeta(response).cache;
  notify({ type: "response", record });
};

/** @type typeof API.recordChunk */
export const recordChunk = (record, chunk, keep) => {
  const { state } = writerOf(record);
  state.bodySize = (state.bodySize ?? 0) + chunk.byteLength;
  if (keep) {
    // The caller gets the same chunk, and can change it or transfer its
    // buffer, so the record keeps a copy
    state.chunks ??= [];
    state.chunks.push(chunk.slice());
  }
};

/** @type typeof API.recordEnd */
export const recordEnd = (record, error) => {
  const { state, notify } = writerOf(record);
  if (state.endTime !== undefined) {
    return;
  }
  state.endTime = performance.now();
  if (error !== undefined) {
    state.error = error;
  } else if (state.bodySize === undefined && state.responseTime !== undefined) {
    state.bodySize = 0;
  }
  notify({ type: "end", record });
};

/** @type (error: unknown) => string */
const errorText = (error) => error instanceof Error ? String(error) : JSON.stringify(error);

/** @type (record: API.FetchRecord) => NonNullable<ReturnType<typeof writers.get>> */
const writerOf = (record) => {
  const writer = writers.get(record);
  if (!writer) {
    throw TypeError("A record can only be written by the session that started it");
  }
  return writer;
};
