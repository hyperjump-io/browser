/**
 * A URL as a message says it. A `file:` URL is relative to the working
 * directory, so where the files are on the machine isn't revealed wherever
 * a message ends up: `schemas/person.json#/name`, or `../other/a.json` for
 * a file outside it. Any other URL is returned as it is.
 *
 * Browser's errors say URLs this way, and keep the exact URL on a property
 * for code that needs it.
 */
export const relativeFileUrl: (url: string) => string;
