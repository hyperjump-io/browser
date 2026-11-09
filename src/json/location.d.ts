/**
 * Add a property name or array index to the location of a node, like
 * `JsonPointer.append` does for a JSON Pointer. A location is a URL whose
 * fragment is a JSON Pointer, so the segment is percent-encoded for use in a
 * fragment.
 */
export const appendToLocation: (segment: string, location: string) => string;
