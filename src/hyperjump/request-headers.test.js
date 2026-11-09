import { describe, test, expect } from "vitest";
import { requestHeadersLayer, resolveRequestHeaders } from "./request-headers.js";

/** @type (request: Request) => Promise<Response> */
const echo = async (request) => Response.json(Object.fromEntries(request.headers));

/** @type (headers: Parameters<typeof resolveRequestHeaders>[0], url: string, init?: RequestInit) => Promise<unknown> */
const sent = async (headers, url, init) => {
  const fetch = requestHeadersLayer(resolveRequestHeaders(headers))(echo);
  const response = await fetch(new Request(url, init));
  return response.json();
};

describe("request headers", () => {
  test("a URL that isn't listed gets none", async () => {
    expect(await sent({ "https://example.com/": { "x-token": "a" } }, "https://other.example.com/a")).to.eql({});
  });

  test("a URL with any scheme can be listed", async () => {
    expect(await sent({ "foo:/a/": { "x-token": "a" } }, "foo:/a/b")).to.eql({ "x-token": "a" });
  });

  test("the request's headers are kept", async () => {
    expect(await sent({ "https://example.com/": { "x-token": "a" } }, "https://example.com/a", { headers: { referer: "https://example.com/b" } }))
      .to.eql({ "referer": "https://example.com/b", "x-token": "a" });
  });
});
