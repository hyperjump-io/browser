import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump, jrefStep } from "./index.js";
import { toJson } from "../json/jsonast-util.js";

describe("JSON Browser", () => {
  describe("step", () => {
    /** @type MockAgent */
    let mockAgent;

    const testDomain = "https://example.com";

    beforeEach(() => {
      mockAgent = new MockAgent();
      mockAgent.disableNetConnect();
      setGlobalDispatcher(mockAgent);
    });

    afterEach(async () => {
      await mockAgent.close();
    });

    test("value", async () => {
      const path = "/subject";
      const url = `${testDomain}${path}`;
      const jref = `{ "foo": 42 }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = hyperjump.session();
      const subject = await session.get(url);
      const foo = await jrefStep(session, "foo", subject);

      expect(toJson(foo)).to.eql(`42`);
    });

    test("local reference to value", async () => {
      const path = "/subject";
      const url = `${testDomain}${path}`;
      const jref = `{
  "foo": 42,
  "bar": { "$ref": "#/foo" }
}`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = hyperjump.session();
      const subject = await session.get(url);
      const foo = await jrefStep(session, "bar", subject);

      expect(toJson(foo)).to.eql(`42`);
    });

    test("local reference to local reference to value", async () => {
      const path = "/subject";
      const url = `${testDomain}${path}`;
      const jref = `{
  "foo": 42,
  "bar": { "$ref": "#/foo" },
  "baz": { "$ref": "#/bar" }
}`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = hyperjump.session();
      const subject = await session.get(url);
      const foo = await jrefStep(session, "baz", subject);

      expect(toJson(foo)).to.eql(`42`);
    });

    test("local reference to external reference to value", async () => {
      const subjectPath = "/subject";
      const url = `${testDomain}${subjectPath}`;
      const subjectJref = `{
  "bar": { "$ref": "/external#/foo" },
  "baz": { "$ref": "#/bar" }
}`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: subjectPath })
        .reply(200, subjectJref, { headers: { "content-type": "application/reference+json" } });

      const externalPath = "/external";
      const externalJref = `{ "foo": 42 }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: externalPath })
        .reply(200, externalJref, { headers: { "content-type": "application/reference+json" } });

      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = hyperjump.session();
      const subject = await session.get(url);
      const foo = await jrefStep(session, "baz", subject);

      expect(toJson(foo)).to.eql(`42`);
    });

    test("external reference to value", async () => {
      const subjectPath = "/subject";
      const url = `${testDomain}${subjectPath}`;
      const subjectJref = `{
  "bar": { "$ref": "/external#/foo" }
}`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: subjectPath })
        .reply(200, subjectJref, { headers: { "content-type": "application/reference+json" } });

      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = hyperjump.session();
      const subject = await session.get(url);

      const externalPath = "/external";
      const externalJref = `{ "foo": 42 }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: externalPath })
        .reply(200, externalJref, { headers: { "content-type": "application/reference+json" } });

      const foo = await jrefStep(session, "bar", subject);

      expect(toJson(foo)).to.eql(`42`);
    });

    test("external reference to local reference to value", async () => {
      const subjectPath = "/subject";
      const url = `${testDomain}${subjectPath}`;
      const subjectJref = `{
  "baz": { "$ref": "/external#/bar" }
}`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: subjectPath })
        .reply(200, subjectJref, { headers: { "content-type": "application/reference+json" } });

      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = hyperjump.session();
      const subject = await session.get(url);

      const externalPath = "/external";
      const externalJref = `{
  "foo": 42,
  "bar": { "$ref": "#/foo" }
}`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: externalPath })
        .reply(200, externalJref, { headers: { "content-type": "application/reference+json" } });

      const foo = await jrefStep(session, "baz", subject);

      expect(toJson(foo)).to.eql(`42`);
    });
  });
});
