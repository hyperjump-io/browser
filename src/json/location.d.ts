/**
 * Add a property name or array index to the location of a node, like
 * `JsonPointer.append` does for a JSON Pointer. A location is a URL whose
 * fragment is a JSON Pointer, so the segment is percent-encoded for use in a
 * fragment. The result is what a URL parser makes of it, so it can be
 * compared to a resolved reference to the same node.
 */
export const appendToLocation: (segment: string, location: string) => string;
