/**
 * A URI as a message says it. A `file:` URI is relative to the working
 * directory, so where the files are on the machine isn't revealed wherever
 * a message ends up: `schemas/person.json#/name`, or `../other/a.json` for
 * a file outside it. Any other URI is returned as it is.
 *
 * Browser's errors say URIs this way, and keep the exact URI on a property
 * for code that needs it.
 */
export const relativeFileUri: (uri: string) => string;
