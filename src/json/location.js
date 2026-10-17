import * as JsonPointer from "@hyperjump/json-pointer";
import { encodeIriFragment } from "@hyperjump/uri";

/**
 * @import * as API from "./location.d.ts"
 */

/** @type API.appendToLocation */
export const appendToLocation = (segment, location) => {
  return location + encodeIriFragment(JsonPointer.append(segment, ""));
};
