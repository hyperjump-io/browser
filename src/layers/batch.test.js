import { describe, test, expect } from "vitest";
import { fetcher } from "../layers.js";
import { defaultTransport } from "../transports/scheme-transport.js";
import { batch } from "./batch.js";
import { startServer } from "../test-helpers/server.js";
import { tick } from "../test-helpers/controlled.js";
import { testSession } from "../test-helpers/session.js";

describe("batch", () => {
  test("combines requests made in the same task", async () => {
    const server = await startServer((request, response) => {
      const ids = /** @type string */ (new URL(/** @type string */ (request.url), "http://localhost").searchParams.get("ids")).split(",");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(Object.fromEntries(ids.map((id) => [id, { id, name: `user ${id}` }]))));
    });
    try {
      const users = batch({
        match: (request) => new URL(request.url).pathname.startsWith("/users/") ? "users" : undefined,
        execute: async (requests, inner, ctx) => {
          const ids = requests.map((request) => new URL(request.url).pathname.split("/").pop());
          const combined = await inner.fetch(new Request(`${server.url}/users?ids=${ids.join(",")}`), ctx);
          const byId = /** @type Record<string, unknown> */ (await combined.json());
          return ids.map((id) => Response.json(byId[/** @type string */ (id)]));
        }
      });
      const session = testSession(users(defaultTransport()), { allow: [server.url] });
      const [a, b, c] = await Promise.all(["1", "2", "3"].map((id) => session.fetch(`${server.url}/users/${id}`)));
      expect(await b.json()).to.eql({ id: "2", name: "user 2" });
      expect(a.ok && c.ok).to.equal(true);
      expect(server.hits.get("/users")).to.equal(1);
    } finally {
      await server.close();
    }
  });

  test("execute gets the most urgent priority of the batch", async () => {
    /** @type string | undefined */
    let seen;
    const session = testSession(batch({
      match: () => "all",
      execute: async (requests, _inner, ctx) => {
        seen = ctx.priority.value;
        return requests.map(() => new Response("ok"));
      }
    })(fetcher(() => new Response("unused"))));
    await Promise.all([
      session.fetch("https://a.test/1", { priority: "low" }),
      session.fetch("https://a.test/2", { priority: "high" }),
      session.fetch("https://a.test/3")
    ]);
    expect(seen).to.equal("high");
  });

  test("maxSize sends a batch as soon as it's full", async () => {
    /** @type number[] */
    const sizes = [];
    const session = testSession(batch({
      match: () => "all",
      maxSize: 2,
      windowMs: 1000,
      execute: async (requests) => {
        sizes.push(requests.length);
        return requests.map(() => new Response("ok"));
      }
    })(fetcher(() => new Response("unused"))));
    await Promise.all([session.fetch("https://a.test/1"), session.fetch("https://a.test/2")]);
    expect(sizes).to.eql([2]);
  });

  test("an execute that returns the wrong number of responses fails every request", async () => {
    const session = testSession(batch({ match: () => "all", execute: async () => [] })(fetcher(() => new Response(""))));
    await expect(session.fetch("https://a.test/1")).rejects.toThrow(/returned 0 responses for 1 requests/);
  });

  describe("scope and aborting", () => {
    test("root puts the requests of a page and its frames in one batch, and session keeps them apart", async () => {
      const shared = usersApi("root");
      const page = testSession(shared.layer);
      const results = [page.fetch("https://a.test/users/1"), page.child().fetch("https://a.test/users/2")];
      await tick();
      shared.release();
      expect(await Promise.all(results.map(async (response) => (await response).text()))).to.eql(["user 1", "user 2"]);
      expect(shared.calls.map((call) => call.ids)).to.eql([["1", "2"]]);

      const separate = usersApi("session");
      const page2 = testSession(separate.layer);
      const results2 = [page2.fetch("https://a.test/users/1"), page2.child().fetch("https://a.test/users/2")];
      await tick();
      separate.release();
      await Promise.all(results2.map(async (response) => (await response).text()));
      expect(separate.calls.map((call) => call.ids)).to.eql([["1"], ["2"]]);
    });

    test("a caller that aborts before the batch is sent is taken out of it", async () => {
      const api = usersApi();
      const session = testSession(api.layer);
      const controller = new AbortController();
      const a = session.fetch("https://a.test/users/1", { signal: controller.signal });
      const b = session.fetch("https://a.test/users/2");
      controller.abort();
      await expect(a).rejects.toMatchObject({ name: "AbortError" });
      await tick();
      api.release();
      expect(await (await b).text()).to.equal("user 2");
      expect(api.calls.map((call) => call.ids)).to.eql([["2"]]);
    });

    test("the first caller aborting after the batch is sent doesn't fail the others", async () => {
      const api = usersApi();
      const session = testSession(api.layer);
      const controller = new AbortController();
      const a = session.fetch("https://a.test/users/1", { signal: controller.signal });
      const b = session.fetch("https://a.test/users/2");
      await tick();
      controller.abort();
      await expect(a).rejects.toMatchObject({ name: "AbortError" });
      expect(api.calls[0].signal.aborted, "the batch has the session's signal").to.equal(false);
      api.release();
      expect(await (await b).text()).to.equal("user 2");
    });

    test("if every caller aborts before it's sent, nothing is sent", async () => {
      const api = usersApi();
      const session = testSession(api.layer);
      const controller = new AbortController();
      const a = session.fetch("https://a.test/users/1", { signal: controller.signal });
      controller.abort();
      await expect(a).rejects.toMatchObject({ name: "AbortError" });
      await tick();
      expect(api.calls).to.eql([]);
    });
  });
});

/**
 * A batch over a pretend API that answers once it's released, and keeps each
 * batch's IDs and signal
 *
 * @param {"session" | "root"} [scope]
 */
const usersApi = (scope) => {
  /** @type {{ ids: string[], signal: AbortSignal }[]} */
  const calls = [];
  /** @type () => void */
  let release = () => {};
  /** @type Promise<void> */
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const layer = batch({
    scope,
    match: (request) => new URL(request.url).pathname.startsWith("/users/") ? "users" : undefined,
    execute: async (requests, _inner, ctx) => {
      const ids = requests.map((request) => /** @type string */ (new URL(request.url).pathname.split("/").pop()));
      calls.push({ ids, signal: ctx.signal });
      await gate;
      return ids.map((id) => new Response(`user ${id}`));
    }
  })(fetcher(() => new Response("unused")));
  return { layer, calls, release: () => release() };
};
