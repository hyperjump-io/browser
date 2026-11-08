import { pointerAppend } from "@hyperjump/json-pointer";
import { encodeIriFragment } from "@hyperjump/uri";

/**
 * @import { IriReference } from "@hyperjump/uri"
 * @import * as API from "./location.d.ts"
 */

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
    encoded = encodeIriFragment(pointerAppend(segment, ""));
    if (segment.length <= maxCachedSegmentLength) {
      if (encodedSegments.size >= maxCachedSegments) {
        encodedSegments.clear();
      }
      encodedSegments.set(segment, encoded);
    }
  }

  // A location's fragment is last, and the segment is encoded for one, so
  // the result is an IRI-reference too
  return /** @type IriReference */ (location + encoded);
};
