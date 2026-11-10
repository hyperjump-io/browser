/**
 * Byte ranges (RFC 9110 §14), for the HTTP cache. Only one range at a time:
 * a request for several goes to the network.
 */

/**
 * A requested range, before the representation's length is known: `a-b` or
 * `a-` (`from`), or `-n` (`suffix`)
 *
 * @typedef {{ kind: "from", start: number, end?: number } | { kind: "suffix", length: number }} RangeSpec
 */

/**
 * Stored bytes of a representation, which can have gaps. `segments` are
 * sorted and don't overlap or touch, and `body` is their bytes one after
 * another.
 *
 * @typedef {{ segments: { start: number, length: number }[], body: Uint8Array }} Segments
 */

/**
 * A `Range` header with one byte range, or `undefined` for anything else
 *
 * @type (header: string | null) => RangeSpec | undefined
 */
export const parseRange = (header) => {
  const match = header && /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!match || (match[1] === "" && match[2] === "")) {
    return undefined;
  }
  if (match[1] === "") {
    const length = Number(match[2]);
    return length > 0 ? { kind: "suffix", length } : undefined;
  }
  const start = Number(match[1]);
  if (match[2] === "") {
    return { kind: "from", start };
  }
  const end = Number(match[2]);
  return end >= start ? { kind: "from", start, end } : undefined;
};

/**
 * A range's bytes, inclusive, for a representation's length if it's known.
 * It's `"unsatisfiable"` when the range starts past the end, and `undefined`
 * when it can't be known without the length.
 *
 * @type (spec: RangeSpec, length: number | undefined) => { start: number, end: number } | "unsatisfiable" | undefined
 */
export const resolveRange = (spec, length) => {
  if (spec.kind === "suffix") {
    if (length === undefined) {
      return undefined;
    }
    return length === 0 ? "unsatisfiable" : { start: Math.max(0, length - spec.length), end: length - 1 };
  }
  if (length !== undefined && spec.start >= length) {
    return "unsatisfiable";
  }
  if (spec.end === undefined) {
    return length === undefined ? undefined : { start: spec.start, end: length - 1 };
  }
  return { start: spec.start, end: length === undefined ? spec.end : Math.min(spec.end, length - 1) };
};

/**
 * `Content-Range: bytes a-b/length`, or `/*` when the length isn't known
 *
 * @type (header: string | null) => { start: number, end: number, length?: number } | undefined
 */
export const parseContentRange = (header) => {
  const match = header && /^\s*bytes\s+(\d+)-(\d+)\/(\d+|\*)\s*$/i.exec(header);
  if (!match) {
    return undefined;
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  const length = match[3] === "*" ? undefined : Number(match[3]);
  if (end < start || (length !== undefined && end >= length)) {
    return undefined;
  }
  return { start, end, length };
};

/**
 * Bytes at `start` added to what's stored. Where they overlap what's there,
 * the new bytes win.
 *
 * @type (existing: Segments, start: number, bytes: Uint8Array) => { segments: Segments["segments"], body: Uint8Array<ArrayBuffer> }
 */
export const addSegment = (existing, start, bytes) => {
  /** @type {{ start: number, bytes: Uint8Array }[]} */
  const pieces = [];
  let offset = 0;
  for (const segment of existing.segments) {
    pieces.push({ start: segment.start, bytes: existing.body.subarray(offset, offset + segment.length) });
    offset += segment.length;
  }
  pieces.push({ start, bytes });
  pieces.sort((a, b) => a.start - b.start);

  /** @type {{ start: number, bytes: Uint8Array }[]} */
  const runs = [];
  for (const piece of pieces) {
    const last = runs.at(-1);
    const lastEnd = last ? last.start + last.bytes.byteLength : -1;
    if (!last || piece.start > lastEnd) {
      runs.push({ start: piece.start, bytes: piece.bytes });
      continue;
    }
    const end = Math.max(lastEnd, piece.start + piece.bytes.byteLength);
    const joined = new Uint8Array(end - last.start);
    joined.set(last.bytes, 0);
    joined.set(piece.bytes, piece.start - last.start);
    runs[runs.length - 1] = { start: last.start, bytes: joined };
  }

  // The pieces were laid down by where they start, not by age, so the new
  // bytes are laid down again on top
  for (const run of runs) {
    if (start >= run.start && start + bytes.byteLength <= run.start + run.bytes.byteLength) {
      run.bytes.set(bytes, start - run.start);
    }
  }

  const body = new Uint8Array(runs.reduce((total, run) => total + run.bytes.byteLength, 0));
  let position = 0;
  for (const run of runs) {
    body.set(run.bytes, position);
    position += run.bytes.byteLength;
  }
  return { segments: runs.map((run) => ({ start: run.start, length: run.bytes.byteLength })), body };
};

/**
 * The bytes of an inclusive range, if one segment has all of them
 *
 * @type (stored: Segments, start: number, end: number) => Uint8Array<ArrayBuffer> | undefined
 */
export const sliceSegments = (stored, start, end) => {
  let offset = 0;
  for (const segment of stored.segments) {
    if (start >= segment.start && end < segment.start + segment.length) {
      const from = offset + (start - segment.start);
      return new Uint8Array(stored.body.subarray(from, from + (end - start + 1)));
    }
    offset += segment.length;
  }
  return undefined;
};

/**
 * Whether the segments are the whole representation
 *
 * @type (stored: Segments, length: number | undefined) => boolean
 */
export const isComplete = (stored, length) => {
  return length !== undefined && stored.segments.length === 1 && stored.segments[0].start === 0 && stored.segments[0].length === length;
};
