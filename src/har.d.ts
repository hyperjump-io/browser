import type { FetchRecord } from "./fetch-record.d.ts";

/** The parts of HAR 1.2 that are made. See http://www.softwareishard.com/blog/har-12-spec/ */
export type Har = {
  log: {
    version: "1.2";
    creator: { name: string; version: string };
    pages: HarPage[];
    entries: HarEntry[];
  };
};

export type HarPage = {
  startedDateTime: string;
  id: string;
  title: string;
  pageTimings: { onContentLoad: number; onLoad: number };
};

export type HarEntry = {
  pageref?: string;
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    cookies: [];
    headers: { name: string; value: string }[];
    queryString: { name: string; value: string }[];
    headersSize: -1;
    bodySize: -1;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    cookies: [];
    headers: { name: string; value: string }[];
    content: { size: number; mimeType: string; text?: string; encoding?: "base64" };
    redirectURL: string;
    headersSize: -1;
    bodySize: -1;
  };
  cache: Record<string, never>;
  timings: { blocked: number; dns: -1; connect: -1; send: number; wait: number; receive: number; ssl: -1 };

  /** HAR allows fields that start with `_`. Chrome reads `_initiator`, `_priority`, and `_resourceType`. */
  _initiator?: { type: "other"; url: string };
  _priority?: string;
  _resourceType?: string;
  _destination?: string;
  _source?: string;
  _cache?: string;
  _redirectHop?: boolean;
  _error?: string;
  _marks?: { name: string; time: number }[];
};

export type HarOptions = {
  /** The page's title. By default, the URL of the first `"document"` request, or of the first request. */
  title?: string;

  /** Each request's marks, in milliseconds from its start, as `_marks`. Default `true`. */
  marks?: boolean;

  creator?: { name: string; version: string };
};

/**
 * Records as a HAR 1.2 log, which browser devtools open, with every entry in
 * one page. Each redirect the `Redirects` layer followed is an entry of its
 * own.
 */
export const toHar: (records: readonly FetchRecord[], options?: HarOptions) => Har;
