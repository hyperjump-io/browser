import { expect } from "vitest";
import { fetcher } from "../layers.js";

/**
 * @import { Fetcher } from "../layers.d.ts"
 */

/**
 * @typedef {{
 *   transport: Fetcher;
 *   started: string[];
 *   answer: (path: string, body?: BodyInit | null, init?: ResponseInit) => void;
 *   fail: (path: string) => void;
 * }} Controlled
 */

/**
 * A transport where each request waits until the test answers it, by its
 * host and path, like `"a.test/x"`. `started` is the requests in the order
 * they reached it.
 *
 * @type () => Controlled
 */
export const controlled = () => {
  /** @type string[] */
  const started = [];
  /** @type Map<string, { resolve: (response: Response) => void, reject: (error: unknown) => void }> */
  const pending = new Map();

  return {
    started,
    transport: fetcher((request) => new Promise((resolve, reject) => {
      const url = new URL(request.url);
      const path = url.host + url.pathname;
      started.push(path);
      pending.set(path, { resolve, reject });
    })),
    answer: (path, body = path, init) => {
      const waiting = pending.get(path);
      expect(waiting, `${path} hasn't started`).toBeDefined();
      pending.delete(path);
      waiting?.resolve(new Response(body, init));
    },
    fail: (path) => {
      pending.get(path)?.reject(new TypeError("boom"));
      pending.delete(path);
    }
  };
};

/**
 * Let what's waiting run, like requests a queue started
 *
 * @type () => Promise<void>
 */
export const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
