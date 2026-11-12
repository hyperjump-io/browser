import { describe, test, expect } from "vitest";
import { compose, fetcher, findLayer, layer, layersOf } from "./layers.js";
import { testHyperjump } from "./test-helpers/hyperjump.js";

/**
 * @import { Fetcher, Layer } from "./layers.d.ts"
 */

describe("layers", () => {
  test("compose wraps the first decorator outermost, and a layer can change the request", async () => {
    /** @type string[] */
    const order = [];
    const addHeader = layer(async (request, ctx, inner) => {
      order.push("a");
      const headers = new Headers(request.headers);
      headers.set("x-from-a", "1");
      return inner.fetch(new Request(request, { headers }), ctx);
    });
    const log = layer(async (request, ctx, inner) => {
      order.push("b");
      return inner.fetch(request, ctx);
    });
    const echo = fetcher((request) => new Response(request.headers.get("x-from-a")));

    const response = await testHyperjump(compose(addHeader, log)(echo)).fetch("https://a.test/");
    expect(await response.text()).to.equal("1");
    expect(order).to.eql(["a", "b"]);
  });

  test("compose is the same as wrapping by hand", async () => {
    const shout = layer(async (request, ctx, inner) => new Response((await (await inner.fetch(request, ctx)).text()).toUpperCase()));
    const echo = fetcher(() => new Response("hi"));
    expect(await (await testHyperjump(shout(echo)).fetch("https://a.test/")).text()).to.equal("HI");
    expect(await (await testHyperjump(compose(shout)(echo)).fetch("https://a.test/")).text()).to.equal("HI");
  });

  test("a stack can be walked, and its layers found by class", () => {
    class Marker {
      /** @param {Fetcher} inner */
      constructor(inner) {
        this.inner = inner;
      }

      /** @type Layer["fetch"] */
      fetch(request, ctx) {
        return this.inner.fetch(request, ctx);
      }
    }
    const transport = fetcher(() => new Response(""));
    const marker = new Marker(transport);
    const stack = layer((request, ctx, inner) => inner.fetch(request, ctx))(marker);

    expect([...layersOf(stack)]).to.eql([stack, marker, transport]);
    expect(findLayer(stack, Marker)).to.equal(marker);
    expect(findLayer(transport, Marker)).to.equal(undefined);
  });
});
