import { describe, test, expect } from "vitest";
import { fileFromFileLayer } from "./file-from-file.js";

/** @type (request: Request) => Promise<Response> */
const reached = async (request) => new Response(request.url);

/** @type (url: string, referer?: string) => Request */
const request = (url, referer) => new Request(url, referer === undefined ? {} : { headers: { referer } });

describe("file: from file:", () => {
  const fetch = fileFromFileLayer(reached);

  test("a file referenced from a file is passed on", async () => {
    const response = await fetch(request("file:///a/b.json", "file:///a/c.json"));
    expect(response.status).to.equal(200);
  });

  test("a file without a Referer is passed on", async () => {
    const response = await fetch(request("file:///a/b.json"));
    expect(response.status).to.equal(200);
  });

  test("a file referenced from somewhere else is refused", async () => {
    const response = await fetch(request("file:///a/b.json", "https://example.com/c.json"));
    expect(response.status).to.equal(403);
    expect(response.url).to.equal("file:///a/b.json");
  });

  test("something that isn't a file is passed on", async () => {
    const response = await fetch(request("https://example.com/b.json", "https://example.com/c.json"));
    expect(response.status).to.equal(200);
  });
});
