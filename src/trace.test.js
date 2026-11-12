import { describe, test, expect } from "vitest";
import { fetcher } from "./layers.js";
import { Trace } from "./trace.js";
import { scheduler } from "./layers/scheduler.js";
import { controlled, tick } from "./test-helpers/controlled.js";
import { testSession } from "./test-helpers/session.js";

const ok = fetcher(() => new Response(""));

describe("traces", () => {
  test("record a session's requests, in the order they started", async () => {
    const session = testSession(ok);
    const trace = new Trace(session);
    await (await session.fetch("https://a.test/first")).text();
    await (await session.fetch("https://a.test/second")).text();
    expect(trace.records.map((record) => record.url)).to.eql(["https://a.test/first", "https://a.test/second"]);
  });

  test("stop records nothing new", async () => {
    const session = testSession(ok);
    const trace = new Trace(session);
    trace.stop();
    await session.fetch("https://a.test/");
    expect(trace.records).to.eql([]);
  });

  test("keep bodies when asked", async () => {
    const session = testSession(fetcher(() => new Response("body")));
    const trace = new Trace(session, { bodies: true });
    await (await session.fetch("https://a.test/")).text();
    expect(new TextDecoder().decode(trace.records[0].body)).to.equal("body");
  });

  test("a failure is in the waterfall", async () => {
    const session = testSession(fetcher(() => Promise.reject(new TypeError("offline"))));
    const trace = new Trace(session);
    await expect(session.fetch("https://a.test/x")).rejects.toThrow(/offline/);
    expect(trace.records[0].endTime).not.to.equal(undefined);
    expect(trace.waterfall()).to.match(/ERR/);
  });

  test("tree puts each request under the one that initiated it", async () => {
    const session = testSession(ok);
    const trace = new Trace(session);
    const page = await session.fetch("https://a.test/");
    const css = await session.fetch("https://a.test/a.css", { initiator: page });
    await session.fetch("https://a.test/font.woff2", { initiator: css });
    await session.fetch("https://a.test/b.js", { initiator: page });
    expect(trace.tree().map(({ record, depth }) => `${depth} ${new URL(record.url).pathname}`)).to.eql(["0 /", "1 /a.css", "2 /font.woff2", "1 /b.js"]);
  });

  test("the waterfall shows the tree, destinations, statuses, and waiting", async () => {
    const net = controlled();
    const session = testSession(scheduler({ perKey: 1 })(net.transport));
    const trace = new Trace(session);
    const pagePending = session.fetch("https://site.test/index.html", { destination: "document" });
    await tick();
    net.answer("site.test/index.html");
    const page = await pagePending;
    await page.text();
    const subresources = ["a.css", "b.js"].map((path) => session.fetch(`https://site.test/${path}`, { initiator: page }));
    await tick();
    net.answer("site.test/a.css");
    await (await subresources[0]).text();
    await tick();
    net.answer("site.test/b.js");
    await (await subresources[1]).text();

    const lines = trace.waterfall({ width: 20 }).split("\n");
    expect(lines.length).to.equal(4);
    expect(lines[1]).to.match(/site\.test\/index\.html\s+document/);
    expect(lines[2]).to.match(/↳ site\.test\/a\.css/);
    expect(lines[3]).to.match(/↳ site\.test\/b\.js .*200\s+\|[ ░█]+\|$/);
    expect(lines[3], "b.js waited for a slot").to.match(/░/);
    const pageId = trace.records[0].id;
    expect(trace.toJSON().map((record) => record.initiator)).to.eql([undefined, pageId, pageId]);
  });

  test("an empty trace says so", () => {
    expect(new Trace(testSession()).waterfall()).to.equal("(no requests)");
  });
});
