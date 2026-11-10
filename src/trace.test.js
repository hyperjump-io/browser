import { describe, test, expect } from "vitest";
import { Session } from "./session.js";
import { fetcher } from "./layers.js";
import { Trace } from "./trace.js";
import { scheduler } from "./layers/scheduler.js";
import { dedupe } from "./layers/dedupe.js";
import { controlled, tick } from "./test-helpers/controlled.js";

const ok = fetcher(() => new Response(""));

describe("traces", () => {
  test("record a session's requests and, by default, its children's", async () => {
    const page = new Session(ok);
    const frame = page.child();
    const all = new Trace(page);
    const pageOnly = new Trace(page, { children: false });
    await (await page.fetch("https://a.test/page")).text();
    await (await frame.fetch("https://a.test/frame")).text();
    expect(all.records.map((record) => record.url)).to.eql(["https://a.test/page", "https://a.test/frame"]);
    expect(pageOnly.records.map((record) => record.url)).to.eql(["https://a.test/page"]);
  });

  test("stop records nothing new", async () => {
    const session = new Session(ok);
    const trace = new Trace(session);
    trace.stop();
    await session.fetch("https://a.test/");
    expect(trace.records).to.eql([]);
  });

  test("keep bodies when asked", async () => {
    const session = new Session(fetcher(() => new Response("body")));
    const trace = new Trace(session, { bodies: true });
    await (await session.fetch("https://a.test/")).text();
    expect(new TextDecoder().decode(trace.records[0].body)).to.equal("body");
  });

  test("a failure is in the waterfall", async () => {
    const session = new Session(fetcher(() => Promise.reject(new TypeError("offline"))));
    const trace = new Trace(session);
    await expect(session.fetch("https://a.test/x")).rejects.toThrow(/offline/);
    expect(trace.records[0].endTime).not.to.equal(undefined);
    expect(trace.waterfall()).to.match(/ERR/);
  });

  test("tree puts each request under the one that initiated it", async () => {
    const session = new Session(ok);
    const trace = new Trace(session);
    const page = await session.fetch("https://a.test/");
    const css = await session.fetch("https://a.test/a.css", { initiator: page });
    await session.fetch("https://a.test/font.woff2", { initiator: css });
    await session.fetch("https://a.test/b.js", { initiator: page });
    expect(trace.tree().map(({ record, depth }) => `${depth} ${new URL(record.url).pathname}`)).to.eql(["0 /", "1 /a.css", "2 /font.woff2", "1 /b.js"]);
  });

  test("the waterfall shows the tree, destinations, statuses, and waiting", async () => {
    const net = controlled();
    const session = new Session(scheduler({ perKey: 1 })(net.transport), { baseURL: "https://site.test/" });
    const trace = new Trace(session);
    const pagePending = session.fetch("index.html", { destination: "document" });
    await tick();
    net.answer("site.test/index.html");
    const page = await pagePending;
    await page.text();
    const subresources = ["a.css", "b.js"].map((url) => session.fetch(url, { initiator: page }));
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

  test("a request that joined another says which", async () => {
    const net = controlled();
    const session = new Session(dedupe()(net.transport));
    const trace = new Trace(session);
    const a = session.fetch("https://a.test/x");
    const b = session.fetch("https://a.test/x");
    await tick();
    net.answer("a.test/x");
    await Promise.all([a, b].map(async (response) => (await response).text()));
    expect(trace.waterfall()).to.match(new RegExp(`joined #${trace.records[0].id}`));
  });

  test("an empty trace says so", () => {
    expect(new Trace(new Session()).waterfall()).to.equal("(no requests)");
  });
});
