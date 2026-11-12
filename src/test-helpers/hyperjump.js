import { Hyperjump } from "../hyperjump.js";

/**
 * @import { Fetcher } from "../layers.d.ts"
 * @import { HyperjumpConfig } from "../hyperjump.d.ts"
 */

/** The made-up origins tests fetch, which the default `allowRetrieval` refuses */
export const testOrigins = [
  "https://a.test/",
  "https://b.test/",
  "https://c.test/",
  "https://site.test/",
  "https://example.com/",
  "https://trusted.example/",
  "http://localhost/"
];

/**
 * A session that can fetch the test origins, for tests that aren't about
 * `allowRetrieval`. Anything else, like a test server, is in `allow`.
 *
 * @type (stack?: Fetcher, config?: Omit<HyperjumpConfig, "stack"> & { allow?: string[] }) => Hyperjump
 */
export const testHyperjump = (stack, { allow = [], ...config } = {}) => new Hyperjump({
  stack,
  allowRetrieval: [...testOrigins, ...allow],
  ...config
});
