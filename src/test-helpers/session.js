import { Session } from "../session.js";

/**
 * @import { Fetcher } from "../layers.d.ts"
 * @import { SessionOptions } from "../session.d.ts"
 */

/** The made-up origins tests fetch, which the default `allowRetrieval` refuses */
export const testOrigins = [
  "https://a.test/",
  "https://b.test/",
  "https://c.test/",
  "https://site.test/",
  "https://pinned.test/",
  "https://example.com/",
  "https://trusted.example/",
  "http://localhost/"
];

/**
 * A session that can fetch the test origins, for tests that aren't about
 * `allowRetrieval`. Anything else, like a test server, is in `allow`.
 *
 * @type (stack?: Fetcher, options?: SessionOptions & { allow?: string[] }) => Session
 */
export const testSession = (stack, { allow = [], ...options } = {}) => new Session(stack, {
  allowRetrieval: [...testOrigins, ...allow],
  ...options
});
