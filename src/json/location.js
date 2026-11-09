import { pointerAppend } from "@hyperjump/json-pointer";

/**
 * @import * as API from "./location.d.ts"
 */

/**
 * What the URL Standard encodes in a fragment, and `%`, so a pointer with a
 * `%` decodes to itself. A location encoded this way is its own `href`.
 */
const fragmentEncodeSet = /[\0-\x20"<>`%\x7F-\u{10FFFF}]/gu;

// Most segments are property names that repeat, in every instance of a
// schema or every item of an array, and encoding them was most of the time
// building a JSON AST took. The cache is cleared when it's full, and long
// names aren't cached, so it can't grow without limit.
/** @type Map<string, string> */
const encodedSegments = new Map();
const maxCachedSegments = 10_000;
const maxCachedSegmentLength = 100;

/** @type typeof API.appendToLocation */
export const appendToLocation = (segment, location) => {
  let encoded = encodedSegments.get(segment);
  if (encoded === undefined) {
    // A property name can have a lone surrogate, which isn't UTF-8, so it's
    // replaced like the URL Standard does
    encoded = pointerAppend(segment, "")
      .toWellFormed()
      .replace(fragmentEncodeSet, encodeURIComponent);
    if (segment.length <= maxCachedSegmentLength) {
      if (encodedSegments.size >= maxCachedSegments) {
        encodedSegments.clear();
      }
      encodedSegments.set(segment, encoded);
    }
  }

  return location + encoded;
};
