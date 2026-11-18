/**
 * Whether a string is a JSON Pointer, by RFC 6901's ABNF: empty, or a `/`
 * before each segment, where a `~` is only the start of `~0` or `~1`
 *
 * @type (pointer: string) => boolean
 */
export const isJsonPointer = (pointer) => jsonPointer.test(pointer);

const jsonPointer = /^(?:\/(?:[^~/]|~[01])*)*$/u;
