/**
 * An error that code can tell from others: its `cause.code` says why, and
 * its `url` is the exact URL it's about, like a network error's. Its message
 * is for people, so it says a `file:` URL relative to the working directory.
 *
 * @type (message: string, cause: { code: string, [key: string]: unknown }, url: string) => Error & { url: string }
 */
export const codedError = (message, cause, url) => Object.assign(new Error(message, { cause }), { url });
