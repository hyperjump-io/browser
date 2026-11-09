import { describe, expect, test } from "vitest";
import { compose } from "./layers.js";

/**
 * @import { Layer } from "./layers.js"
 */

/**
 * A layer that adds its name to the `x-seen` request header and the
 * `x-returned` response header
 *
 * @type (name: string) => Layer
 */
const named = (name) => (next) => async (request) => {
  const headers = new Headers(request.headers);
  headers.append("x-seen", name);
  const response = await next(new Request(request, { headers }));
  const responseHeaders = new Headers(response.headers);
  responseHeaders.append("x-returned", name);
  return new Response(response.body, { status: response.status, headers: responseHeaders });
};

/** @type (request: Request) => Promise<Response> */
const echo = async (request) => new Response(null, { headers: { "x-seen": request.headers.get("x-seen") ?? "" } });

describe("compose", () => {
  test("no layers is the fetch", async () => {
    expect(compose([], echo)).to.equal(echo);
  });

  test("the first layer sees the request first and the response last", async () => {
    const fetch = compose([named("a"), named("b")], echo);
    const response = await fetch(new Request("foo:/a"));
    expect(response.headers.get("x-seen")).to.equal("a, b");
    expect(response.headers.get("x-returned")).to.equal("b, a");
  });

  test("a layer can answer without the layers below it", async () => {
    /** @type Layer */
    const refuse = () => async () => new Response(null, { status: 403 });
    const fetch = compose([named("a"), refuse, named("b")], echo);
    const response = await fetch(new Request("foo:/a"));
    expect(response.status).to.equal(403);
    expect(response.headers.get("x-returned")).to.equal("a");
  });
});
