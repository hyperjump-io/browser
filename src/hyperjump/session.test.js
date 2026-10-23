import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump, JrefMediaTypePlugin } from "./index.js";
import { toJson } from "../json/jsonast-util.js";

describe("JSON Browser", () => {
  describe("session", () => {
    const testDomain = "https://example.com";
    const headers = { "content-type": "application/reference+json" };

    /** @type MockAgent */
    let mockAgent;

    beforeEach(() => {
      mockAgent = new MockAgent();
      mockAgent.disableNetConnect();
      setGlobalDispatcher(mockAgent);
    });

    afterEach(async () => {
      await mockAgent.close();
    });

    test("a document is retrieved once per session", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42 }`, { headers });

      const session = new Hyperjump({ allowRetrieval: ["https://example.com/"] }).session();
      const first = await session.getDocument(`${testDomain}/foo`);
      const second = await session.getDocument(`${testDomain}/foo#/foo`);

      expect(second).to.equal(first);
    });

    test("a document requested again while it's being retrieved is retrieved once", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42 }`, { headers });

      const session = new Hyperjump({ allowRetrieval: ["https://example.com/"] }).session();
      const [first, second] = await Promise.all([
        session.getDocument(`${testDomain}/foo`),
        session.getDocument(`${testDomain}/foo`)
      ]);

      expect(second).to.equal(first);
    });

    test("sessions don't share documents", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42 }`, { headers });
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 24 }`, { headers });

      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const first = await hyperjump.session().get(`${testDomain}/foo#/foo`);
      const second = await hyperjump.session().get(`${testDomain}/foo#/foo`);

      expect(toJson(first)).to.equal(`42`);
      expect(toJson(second)).to.equal(`24`);
    });

    test("a media type plugin parses for the session the document is retrieved in", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `42`, { headers: { "content-type": "application/prs.hyperjump-session-test" } });

      /** @type unknown */
      let parsedFor;

      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const jref = new JrefMediaTypePlugin();
      hyperjump.addMediaTypePlugin({
        mediaType: "application/prs.hyperjump-session-test",
        extensions: [],
        parse: async (response, session) => {
          parsedFor = session;
          return jref.parse(response);
        }
      });
      const session = hyperjump.session();
      await session.get(`${testDomain}/foo`);

      expect(parsedFor).to.equal(session);
    });

    test("a failed retrieval can be tried again", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(500, "");
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42 }`, { headers });

      const session = new Hyperjump({ allowRetrieval: ["https://example.com/"] }).session();
      await expect(session.get(`${testDomain}/foo`)).rejects.toThrow("Unable to load resource");
      const subject = await session.get(`${testDomain}/foo#/foo`);

      expect(toJson(subject)).to.equal(`42`);
    });
  });
});
