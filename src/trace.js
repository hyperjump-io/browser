import { waitingUntil } from "./waiting.js";

/**
 * @import * as API from "./trace.d.ts"
 * @import { FetchRecord } from "./fetch-record.d.ts"
 * @import { Session } from "./session.d.ts"
 */

/** @implements API.Trace */
export class Trace {
  /** @type FetchRecord[] */
  #records = [];

  /** @type () => void */
  #stop;

  /**
   * @param {Session} session
   * @param {API.TraceOptions} [options]
   */
  constructor(session, options = {}) {
    this.session = session;
    const children = options.children ?? true;
    this.#stop = session.observe((event) => {
      if (event.type === "start" && (children || event.record.session === session)) {
        this.#records.push(event.record);
      }
    }, { bodies: options.bodies ?? false });
  }

  get records() {
    return this.#records;
  }

  /** @type API.Trace["stop"] */
  stop() {
    this.#stop();
  }

  /** @type API.Trace["tree"] */
  tree() {
    const inTrace = new Set(this.#records);
    /** @type Map<FetchRecord | undefined, FetchRecord[]> */
    const children = new Map();
    for (const record of this.#records) {
      const parent = record.initiator && inTrace.has(record.initiator) ? record.initiator : undefined;
      children.set(parent, [...children.get(parent) ?? [], record]);
    }

    /** @type {{ record: FetchRecord, depth: number }[]} */
    const rows = [];
    /** @type (parent: FetchRecord | undefined, depth: number) => void */
    const visit = (parent, depth) => {
      for (const record of children.get(parent) ?? []) {
        rows.push({ record, depth });
        visit(record, depth + 1);
      }
    };
    visit(undefined, 0);
    return rows;
  }

  /** @type API.Trace["waterfall"] */
  waterfall(options = {}) {
    const width = options.width ?? 40;
    const urlWidth = options.urlWidth ?? 44;
    const rows = this.tree();
    if (rows.length === 0) {
      return "(no requests)";
    }

    const origin = Math.min(...rows.map(({ record }) => record.startTime));
    const end = Math.max(...rows.map(({ record }) => record.endTime ?? record.responseTime ?? record.startTime), origin + 1);
    const scale = width / (end - origin);
    /** @type (time: number) => number */
    const column = (time) => Math.min(width - 1, Math.max(0, Math.floor((time - origin) * scale)));

    const lines = rows.map(({ record, depth }) => {
      const name = (depth ? "  ".repeat(depth - 1) + "↳ " : "") + shortUrl(record.url);
      const status = record.error === undefined ? String(record.status ?? "…") : "ERR";
      const bar = Array.from({ length: width }, () => " ");
      const start = column(record.startTime);
      const stop = column(record.endTime ?? record.responseTime ?? record.startTime);
      for (let index = start; index <= stop; index++) {
        bar[index] = "█";
      }
      const waitedUntil = waitingUntil(record);
      if (waitedUntil !== undefined) {
        for (let index = start; index < column(waitedUntil); index++) {
          bar[index] = "░";
        }
      }
      return [
        String(record.id).padStart(3),
        pad(name, urlWidth),
        pad(record.destination || "-", 8),
        pad(sourceOf(record), 16),
        pad(status, 4),
        `|${bar.join("")}|`
      ].join(" ");
    });

    const total = `${Math.round(end - origin)}ms`;
    const header = [
      "  #",
      pad("url", urlWidth),
      pad("dest", 8),
      pad("source", 16),
      pad("stat", 4),
      ` 0ms${" ".repeat(Math.max(1, width - 3 - total.length))}${total}`
    ].join(" ");
    return [header, ...lines].join("\n");
  }

  /** @type API.Trace["toJSON"] */
  toJSON() {
    return this.#records.map((record) => record.toJSON());
  }
}

/**
 * What the source column says: the request it joined, what the cache did, or
 * where its response came from
 *
 * @type (record: FetchRecord) => string
 */
const sourceOf = (record) => {
  const joined = record.marks.find((mark) => mark.name === "dedupe:joined");
  if (joined) {
    return `joined #${/** @type {{ request: number }} */ (joined.detail).request}`;
  }
  if (record.cache && record.cache !== "miss" && record.cache !== "bypass") {
    return `cache ${record.cache}`;
  }
  return record.source ?? "";
};

/** @type (url: string) => string */
const shortUrl = (url) => {
  const parsed = URL.parse(url);
  return parsed && (parsed.protocol === "http:" || parsed.protocol === "https:") ? parsed.host + parsed.pathname + parsed.search : url;
};

/** @type (text: string, width: number) => string */
const pad = (text, width) => text.length > width ? text.slice(0, width - 1) + "…" : text.padEnd(width);
