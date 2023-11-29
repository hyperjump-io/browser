import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { get, step, value } from "../index.js";
import type { Browser } from "../index.js";


describe("JSON Browser", () => {
  describe("step", () => {
    let mockAgent: MockAgent;
    let subject: Browser;

    const testDomain = "https://example.com";

    beforeEach(async () => {
      mockAgent = new MockAgent();
      mockAgent.disableNetConnect();
      setGlobalDispatcher(mockAgent);
    });

    afterEach(async () => {
      await mockAgent.close();
    });

    it("value", async () => {
      const path = "/subject";
      const jref = `{ "foo": 42 }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const subject = await get(testDomain + path);
      const foo = await step("foo", subject);

      expect(foo.uri).to.equal(testDomain + path);
      expect(foo.cursor).to.equal("/foo");
      expect(foo.document.baseUri).to.equal(testDomain + path);
      expect(value(foo)).to.equal(42);
    });

    it("local reference to value", async () => {
      const path = "/subject";
      const jref = `{
  "foo": 42,
  "bar": { "$href": "#/foo" }
}`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const subject = await get(testDomain + path);
      const foo = await step("bar", subject);

      expect(foo.uri).to.equal(`${testDomain}${path}#/foo`);
      expect(foo.cursor).to.equal("/foo");
      expect(foo.document.baseUri).to.equal(testDomain + path);
      expect(value(foo)).to.equal(42);
    });

    it("local reference to local reference to value", async () => {
      const path = "/subject";
      const jref = `{
  "foo": 42,
  "bar": { "$href": "#/foo" },
  "baz": { "$href": "#/bar" }
}`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const subject = await get(testDomain + path);
      const foo = await step("baz", subject);

      expect(foo.uri).to.equal(`${testDomain}${path}#/foo`);
      expect(foo.cursor).to.equal("/foo");
      expect(foo.document.baseUri).to.equal(testDomain + path);
      expect(value(foo)).to.equal(42);
    });

    it("local reference to external reference to value", async () => {
      const subjectPath = "/subject";
      const subjectJref = `{
  "bar": { "$href": "/external#/foo" },
  "baz": { "$href": "#/bar" }
}`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: subjectPath })
        .reply(200, subjectJref, { headers: { "content-type": "application/reference+json" } });

      const externalPath = "/external";
      const externalJref = `{ "foo": 42 }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: externalPath })
        .reply(200, externalJref, { headers: { "content-type": "application/reference+json" } });

      const subject = await get(testDomain + subjectPath);
      const foo = await step("baz", subject);

      expect(foo.uri).to.equal(`${testDomain}${externalPath}#/foo`);
      expect(foo.cursor).to.equal("/foo");
      expect(foo.document.baseUri).to.equal(testDomain + externalPath);
      expect(value(foo)).to.equal(42);
    });

    it("external reference to value", async () => {
      const subjectPath = "/subject";
      const subjectJref = `{
  "bar": { "$href": "/external#/foo" }
}`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: subjectPath })
        .reply(200, subjectJref, { headers: { "content-type": "application/reference+json" } });

      subject = await get(testDomain + subjectPath);

      const externalPath = "/external";
      const externalJref = `{ "foo": 42 }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: externalPath })
        .reply(200, externalJref, { headers: { "content-type": "application/reference+json" } });

      const foo = await step("bar", subject);

      expect(foo.uri).to.equal(`${testDomain}${externalPath}#/foo`);
      expect(foo.cursor).to.equal("/foo");
      expect(foo.document.baseUri).to.equal(testDomain + externalPath);
      expect(value(foo)).to.equal(42);
    });

    it("external reference to local reference to value", async () => {
      const subjectPath = "/subject";
      const subjectJref = `{
  "baz": { "$href": "/external#/bar" }
}`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: subjectPath })
        .reply(200, subjectJref, { headers: { "content-type": "application/reference+json" } });

      subject = await get(testDomain + subjectPath);

      const externalPath = "/external";
      const externalJref = `{
  "foo": 42,
  "bar": { "$href": "#/foo" }
}`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: externalPath })
        .reply(200, externalJref, { headers: { "content-type": "application/reference+json" } });

      const foo = await step("baz", subject);

      expect(foo.uri).to.equal(`${testDomain}${externalPath}#/foo`);
      expect(foo.document.baseUri).to.equal(testDomain + externalPath);
      expect(foo.cursor).to.equal("/foo");
      expect(value(foo)).to.equal(42);
    });
  });
});
