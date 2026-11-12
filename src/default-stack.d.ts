import type { Fetcher } from "./layers.d.ts";

/**
 * A new stack like the one a session has when it isn't given one: in
 * Node.js, a `scheduler()` on `nodeTransport()`, and in a browser,
 * `defaultTransport()`. A session without a stack has one of its own, so to
 * share one between sessions, put it in the configuration they're made
 * from: `{ stack: defaultStack() }`.
 */
export const defaultStack: () => Fetcher;
