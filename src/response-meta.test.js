import { describe, test, expect } from "vitest";
import { cloneResponse, networkError, replaceBody, responseMeta, setResponseMeta, trackBody, withUrl } from "./response-meta.js";

describe("response meta", () => {
  test("a response has no meta until it's given some", () => {
    const response = new Response("a");
    expect(responseMeta(response)).to.eql({});
    setResponseMeta(response, { source: "network" });
    expect(responseMeta(response)).to.eql({ source: "network" });
  });

  test("a clone has a copy of the meta", () => {
    const response = setResponseMeta(new Response("a"), { source: "network" });
    const copy = cloneResponse(response);
    setResponseMeta(copy, { source: "http-cache" });
    expect(responseMeta(response).source).to.equal("network");
    expect(responseMeta(copy).source).to.equal("http-cache");
  });

  test("a response that was made gets a URL", () => {
    expect(withUrl(new Response("a"), "https://example.com/a").url).to.equal("https://example.com/a");
  });

  test("replacing a body keeps the status, headers, URL, redirected, and meta", async () => {
    const response = withUrl(new Response("a", { status: 201, headers: { "x-a": "1" } }), "https://example.com/a");
    Object.defineProperty(response, "redirected", { value: true });
    setResponseMeta(response, { source: "network" });

    const replaced = replaceBody(response, new Response("b").body);
    expect(replaced.status).to.equal(201);
    expect(replaced.headers.get("x-a")).to.equal("1");
    expect(replaced.url).to.equal("https://example.com/a");
    expect(replaced.redirected).to.equal(true);
    expect(responseMeta(replaced)).to.eql({ source: "network" });
    expect(await replaced.text()).to.equal("b");
  });

  describe("trackBody", () => {
    test("calls done once the body has been read", async () => {
      let done = 0;
      const chunks = [];
      const response = trackBody(new Response("abc"), () => done++, (chunk) => chunks.push(chunk));
      expect(done).to.equal(0);
      expect(await response.text()).to.equal("abc");
      expect(done).to.equal(1);
      expect(chunks.length).to.be.greaterThan(0);
    });

    test("calls done when the body is cancelled", async () => {
      let done = 0;
      const response = trackBody(new Response("abc"), () => done++);
      await response.body?.cancel();
      expect(done).to.equal(1);
    });

    test("calls done when the body fails while nothing is reading it", async () => {
      let done = 0;
      /** @type ReadableStreamDefaultController<Uint8Array> | undefined */
      let source;
      const body = new ReadableStream({
        start(controller) {
          source = controller;
          controller.enqueue(new TextEncoder().encode("abc"));
        }
      });
      const response = trackBody(new Response(body), () => done++);
      await new Promise((resolve) => setTimeout(resolve));
      expect(done).to.equal(0);
      source?.error(new TypeError("aborted"));
      await new Promise((resolve) => setTimeout(resolve));
      expect(done).to.equal(1);
      await expect(response.text()).rejects.toThrow("aborted");
    });

    test("calls done right away for a response without a body", () => {
      let done = 0;
      trackBody(new Response(null, { status: 204 }), () => done++);
      expect(done).to.equal(1);
    });
  });

  test("a network error is a TypeError with its cause", () => {
    const cause = Error("a");
    const error = networkError("Failed", cause);
    expect(error).to.be.instanceOf(TypeError);
    expect(error.cause).to.equal(cause);
  });
});
