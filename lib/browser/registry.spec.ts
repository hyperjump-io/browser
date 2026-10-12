import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { get, value, step } from "../index.js";
import { parse } from "../jref/index.js";

import type { Browser, Document } from "../index.js";


describe("JSON Browser", () => {
  describe("registry", () => {
    const testDomain = "https://registry.hyperjump.io";
    let mockAgent: MockAgent;

    beforeEach(() => {
      mockAgent = new MockAgent();
      mockAgent.disableNetConnect();
      setGlobalDispatcher(mockAgent);
    });

    afterEach(async () => {
      await mockAgent.close();
    });

    const makeDocument = (baseUri: string, jref: string, embedded?: Record<string, Document>): Document => ({
      baseUri: baseUri,
      root: parse(jref),
      anchorLocation: (fragment: string | undefined) => fragment ?? "",
      embedded: embedded
    });

    const makeBrowser = (registry: Record<string, Document>) => {
      return { _cache: {}, _registry: registry } as unknown as Browser;
    };

    test("getting a registered document", async () => {
      const uri = `${testDomain}/foo`;
      const browser = await get(uri, makeBrowser({ [uri]: makeDocument(uri, `{ "foo": 42 }`) }));

      expect(browser.uri).to.equal(uri);
      expect(value(browser)).to.eql({ foo: 42 });
    });

    test("following a reference to a registered document", async () => {
      const mainUri = `${testDomain}/main`;
      const fooUri = `${testDomain}/foo`;
      const registry = {
        [mainUri]: makeDocument(mainUri, `{ "bar": { "$ref": "foo#/foo" } }`),
        [fooUri]: makeDocument(fooUri, `{ "foo": 42 }`)
      };
      const main = await get(mainUri, makeBrowser(registry));
      const subject = await step("bar", main);

      expect(subject.uri).to.equal(`${fooUri}#/foo`);
      expect(value(subject)).to.equal(42);
    });

    test("seeing documents registered after the browser was created", async () => {
      const mainUri = `${testDomain}/main`;
      const fooUri = `${testDomain}/foo`;
      const registry: Record<string, Document> = { [mainUri]: makeDocument(mainUri, `{}`) };
      const main = await get(mainUri, makeBrowser(registry));
      registry[fooUri] = makeDocument(fooUri, `{ "foo": 42 }`);
      const subject = await get(fooUri, main);

      expect(value(subject)).to.eql({ foo: 42 });
    });

    test("seeing a visited document's replacement in the registry", async () => {
      const mainUri = `${testDomain}/main`;
      const fooUri = `${testDomain}/foo`;
      const registry: Record<string, Document> = {
        [mainUri]: makeDocument(mainUri, `{}`),
        [fooUri]: makeDocument(fooUri, `{ "foo": 42 }`)
      };
      const main = await get(mainUri, makeBrowser(registry));
      await get(fooUri, main);
      registry[fooUri] = makeDocument(fooUri, `{ "foo": 0 }`);
      const subject = await get(fooUri, main);

      expect(value(subject)).to.eql({ foo: 0 });
    });

    test("preferring a retrieved document over a registered one", async () => {
      const fooUri = `${testDomain}/foo`;
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": "retrieved" }`, { headers: { "content-type": "application/reference+json" } });
      const retrieved = await get(fooUri);
      const browser = { ...retrieved, _registry: { [fooUri]: makeDocument(fooUri, `{ "foo": "registered" }`) } };
      const subject = await get(fooUri, browser);

      expect(value(subject)).to.eql({ foo: "retrieved" });
      mockAgent.assertNoPendingInterceptors();
    });

    test("preferring a registered document over an embedded one", async () => {
      const mainUri = `${testDomain}/main`;
      const fooUri = `${testDomain}/foo`;
      const registry = {
        [mainUri]: makeDocument(mainUri, `{}`, { [fooUri]: makeDocument(fooUri, `{ "foo": "embedded" }`) }),
        [fooUri]: makeDocument(fooUri, `{ "foo": "registered" }`)
      };
      const main = await get(mainUri, makeBrowser(registry));
      const subject = await get(fooUri, main);

      expect(value(subject)).to.eql({ foo: "registered" });
    });

    test("retrieving documents that aren't registered", async () => {
      const fooUri = `${testDomain}/foo`;
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42 }`, { headers: { "content-type": "application/reference+json" } });
      const subject = await get(fooUri, makeBrowser({}));

      expect(value(subject)).to.eql({ foo: 42 });
      mockAgent.assertNoPendingInterceptors();
    });
  });
});
