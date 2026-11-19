import { waitingUntil } from "./waiting.js";

/**
 * @import * as API from "./har.d.ts"
 * @import { FetchRecord } from "./fetch-record.d.ts"
 */

/** Priorities as Chrome's */
const chromePriorities = new Map([["high", "High"], ["auto", "Medium"], ["low", "Low"]]);

/**
 * Headers with credentials, which are left out unless they're asked for, as
 * Chrome's sanitized HAR leaves them out. A HAR is shared, like in a bug
 * report.
 */
const sensitiveHeaders = new Set(["authorization", "proxy-authorization", "cookie", "set-cookie"]);

/**
 * @typedef {{ marks: boolean, sensitive: boolean }} Include
 * @typedef {{ status: number, from: string, to: string, requestHeaders: [string, string][] }} RedirectDetail
 */

/** @type typeof API.toHar */
export const toHar = (records, options = {}) => {
  const pageref = "page_1";
  const ordered = records.toSorted((a, b) => a.startTime - b.startTime);
  const first = ordered[0];
  const title = options.title ?? first?.url ?? "";
  return {
    log: {
      version: "1.2",
      creator: options.creator ?? { name: "@hyperjump/browser", version: "2.0.0" },
      pages: first ? [{ startedDateTime: isoAt(first.startTime), id: pageref, title, pageTimings: { onContentLoad: -1, onLoad: -1 } }] : [],
      entries: ordered.flatMap((record) => entriesFor(record, pageref, { marks: options.marks ?? true, sensitive: options.sensitive ?? false }))
    }
  };
};

/**
 * A record's entries: one for each redirect the session followed, made from
 * its marks, and one for the last step. A step's request headers are the
 * record's for the first, and the mark's of the redirect that led to it
 * after that. Time spent waiting in a queue is the first step's `blocked`.
 *
 * @type (record: FetchRecord, pageref: string, include: Include) => API.HarEntry[]
 */
const entriesFor = (record, pageref, include) => {
  const redirects = record.marks.filter((mark) => mark.name === "redirect");
  const queuedUntil = waitingUntil(record);
  const firstBlocked = queuedUntil === undefined ? 0 : round(queuedUntil - record.startTime);

  /** @type API.HarEntry[] */
  const entries = [];
  let stepStart = record.startTime;
  let requestHeaders = record.requestHeaders;
  for (const [index, mark] of redirects.entries()) {
    const { status, from, to } = /** @type RedirectDetail */ (mark.detail);
    const time = round(mark.time - stepStart);
    const blocked = index === 0 ? Math.min(firstBlocked, time) : 0;
    entries.push({
      ...common(record, pageref, from, stepStart, harHeaders(requestHeaders, include.sensitive)),
      time,
      response: { ...emptyResponse(), status, statusText: "", headers: [{ name: "location", value: to }], redirectURL: to },
      timings: { blocked, dns: -1, connect: -1, send: 0, wait: round(time - blocked), receive: 0, ssl: -1 },
      _redirectHop: true
    });
    stepStart = mark.time;
    requestHeaders = /** @type RedirectDetail */ (mark.detail).requestHeaders;
  }

  const lastRedirect = redirects.at(-1);
  const url = lastRedirect ? /** @type {{ to: string }} */ (lastRedirect.detail).to : record.url;
  const end = record.endTime ?? record.responseTime ?? stepStart;
  const blocked = redirects.length === 0 ? firstBlocked : 0;
  const wait = Math.max(0, round((record.responseTime ?? end) - stepStart) - blocked);
  const receive = record.responseTime === undefined ? 0 : round(end - record.responseTime);
  const headers = record.responseHeaders ?? [];
  const mimeType = headers.find(([name]) => name === "content-type")?.[1] ?? "";

  /** @type API.HarEntry */
  const entry = {
    ...common(record, pageref, url, stepStart, harHeaders(requestHeaders, include.sensitive)),
    time: round(blocked + wait + receive),
    response: {
      ...emptyResponse(),
      status: record.error === undefined ? record.status ?? 0 : 0,
      statusText: record.statusText ?? "",
      headers: harHeaders(headers, include.sensitive),
      content: { size: record.bodySize ?? record.body?.byteLength ?? 0, mimeType, ...content(record.body, mimeType) },
      redirectURL: headers.find(([name]) => name === "location")?.[1] ?? ""
    },
    timings: { blocked, dns: -1, connect: -1, send: 0, wait, receive, ssl: -1 }
  };
  if (record.source !== undefined) {
    entry._source = record.source;
  }
  if (record.cache !== undefined) {
    entry._cache = record.cache;
  }
  if (record.error !== undefined) {
    entry._error = record.toJSON().error;
  }
  if (include.marks && record.marks.length > 0) {
    entry._marks = record.marks.map((mark) => ({ name: mark.name, time: round(mark.time - record.startTime) }));
  }
  entries.push(entry);
  return entries;
};

/**
 * What every entry of a record has. Its priority is the one the layers used:
 * as it reached the transport, or as it was asked for.
 *
 * @type (record: FetchRecord, pageref: string, url: string, start: number, headers: API.HarEntry["request"]["headers"]) => Omit<API.HarEntry, "time" | "response" | "timings">
 */
const common = (record, pageref, url, start, headers) => {
  /** @type (name: string) => string | undefined */
  const used = (name) => /** @type {{ priority?: string } | undefined} */ (record.marks.find((mark) => mark.name === name)?.detail)?.priority;
  const priority = used("network:start") ?? used("file:read") ?? record.priority;
  return {
    pageref,
    startedDateTime: isoAt(start),
    request: {
      method: record.method,
      url,
      httpVersion: "",
      cookies: [],
      headers,
      queryString: queryString(url),
      headersSize: -1,
      bodySize: -1
    },
    cache: {},
    _priority: chromePriorities.get(priority) ?? priority,
    ...record.initiator ? { _initiator: { type: "other", url: record.initiator.url } } : {}
  };
};

/**
 * Headers as HAR's, without the ones with credentials unless they're asked
 * for
 *
 * @type (headers: readonly [string, string][], sensitive: boolean) => { name: string, value: string }[]
 */
const harHeaders = (headers, sensitive) => headers
  .filter(([name]) => sensitive || !sensitiveHeaders.has(name.toLowerCase()))
  .map(([name, value]) => ({ name, value }));

/** @type () => Omit<API.HarEntry["response"], "status" | "statusText" | "headers" | "redirectURL"> */
const emptyResponse = () => ({ httpVersion: "", cookies: [], content: { size: 0, mimeType: "" }, headersSize: -1, bodySize: -1 });

/**
 * A body as HAR content: as text for a text type, and base64 otherwise
 *
 * @type (body: Uint8Array | undefined, mimeType: string) => { text?: string, encoding?: "base64" }
 */
const content = (body, mimeType) => {
  if (!body) {
    return {};
  }
  if (/^text\/|[+/](json|xml|javascript|ecmascript)\b|charset=/i.test(mimeType)) {
    return { text: new TextDecoder().decode(body) };
  }
  let binary = "";
  for (const byte of body) {
    binary += String.fromCodePoint(byte);
  }
  return { text: btoa(binary), encoding: "base64" };
};

/** @type (url: string) => { name: string, value: string }[] */
const queryString = (url) => [...URL.parse(url)?.searchParams ?? []].map(([name, value]) => ({ name, value }));

/** @type (time: number) => string */
const isoAt = (time) => new Date(performance.timeOrigin + time).toISOString();

/** @type (milliseconds: number) => number */
const round = (milliseconds) => Math.round(milliseconds * 1000) / 1000;
