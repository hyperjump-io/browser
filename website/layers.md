# Layers

A stack is a series of layers, each one wrapping the one below it. A request
goes in at the top and comes out at the bottom, at a
[transport](transports.md) that retrieves it. Each layer can answer the request
itself, change it, or pass it on.

## Build a stack

`compose` puts layers on a transport. The first layer is the top of the stack,
so it gets each request first:

```typescript
import { Hyperjump, compose, defaultTransport } from "@hyperjump/browser";

const stack = compose(first(), second())(defaultTransport());
const session = new Hyperjump({
  stack,
  allowRetrieval: ["https://example.com/"]
});
```

That's the same as wrapping each layer by hand:

```typescript
const stack = first()(second()(defaultTransport()));
```

A stack is a fetcher, like a transport or a single layer, so you can give any
part of a stack to a Hyperjump session, or wrap a stack in more layers.

## Write a layer

`layer` makes a layer from a function. The function gets the request, its
context, and the fetcher below it. This one adds a header to every request:

```typescript
import { layer } from "@hyperjump/browser";

const userAgent = layer((request, ctx, inner) => {
  const headers = new Headers(request.headers);
  headers.set("User-Agent", "my-tool/1.0");
  return inner.fetch(new Request(request, { headers }), ctx);
});

const stack = compose(userAgent)(defaultTransport());
```

A header like this goes to every URL the stack fetches, so don't add credentials
this way. A Hyperjump session's `headers` option sends them only to the URLs
they're for. For more information, see
[Hyperjump sessions](hyperjump-sessions.md#headers).

## The context

Each request goes down the stack with a context:

| Property | Description |
| --- | --- |
| `session` | The session the request is in |
| `cacheMode` | The request's cache mode, from `fetch(url, { cache })` |
| `priority` | The request's priority, which can change while it waits. Read `priority.value`. |
| `record` | The request's record. Call `record.mark(name, detail)` to say what your layer did. |

To give the layer below a different value, pass it a copy of the context, such
as `inner.fetch(request, { ...ctx, priority })`.

A request's own `signal` aborts when the caller aborts or the Hyperjump session
closes. If your layer makes a new request, give it a signal, such as
`ctx.session.signal`, which aborts when the session closes.

## Wrap a response's body

A response knows things that a new `Response` doesn't, such as its record and
where it came from (see [Where a response came from](#where-a-response-came-from)).
To change a response's body or keep a copy of it, use these functions, which
keep what the response knows:

| Function | Description |
| --- | --- |
| `replaceBody(response, body)` | The same response with another body, such as a stream that decompresses it. Its status, headers, URL, and `redirected` are kept. It doesn't work for an opaque response. |
| `trackBody(response, done, onChunk)` | Calls `done` once, when the body has been read to the end, cancelled, or failed, or right away if there's no body. A body fails when its request is aborted, even if nothing is reading it. `onChunk` gets each chunk as the body is read. Return the response that `trackBody` returns, not the one you gave it. |
| `cloneResponse(response)` | `response.clone()`, and the clone knows what the response does |

This layer marks each request's record with how many bytes its body had:

```typescript
import { layer, trackBody } from "@hyperjump/browser";

const bodySize = layer(async (request, ctx, inner) => {
  const response = await inner.fetch(request, ctx);
  let bytes = 0;
  return trackBody(
    response,
    () => ctx.record.mark("body-size", { bytes }),
    (chunk) => { bytes += chunk.byteLength; }
  );
});
```

`trackBody` is also how a layer holds something for as long as a body is being
read, such as a slot in a queue: release it in `done`.

## Write a layer as a class

A layer that needs methods or state of its own is a class with an `inner`
property and a `fetch` method. The built-in layers are classes, and each one
has a function that makes it, like `httpCache()`. Write yours the same way, so
it works with `compose` and `findLayer`.

Hyperjump sessions can share a stack, so a layer keeps its state for each
session with `ctx.session.state(key, init)`. The session calls `init` the first
time it's asked for a key's state, and gives the same state for that key until
the session ends. Use the layer itself as the key. This layer counts each
session's requests:

```typescript
import {
  compose,
  defaultTransport,
  type FetchContext,
  type Fetcher,
  type Hyperjump,
  type Layer
} from "@hyperjump/browser";

class RequestCounter implements Layer {
  readonly inner: Fetcher;

  constructor(inner: Fetcher) {
    this.inner = inner;
  }

  async fetch(request: Request, ctx: FetchContext) {
    this.#state(ctx.session).count++;
    return this.inner.fetch(request, ctx);
  }

  count(session: Hyperjump) {
    return this.#state(session).count;
  }

  #state(session: Hyperjump) {
    return session.state(this, () => ({ count: 0 }));
  }
}

const requestCounter = () => (inner: Fetcher) => new RequestCounter(inner);

const stack = compose(requestCounter())(defaultTransport());
```

To call its method, find it in the stack with `findLayer`:

```typescript
import { findLayer } from "@hyperjump/browser";

findLayer(stack, RequestCounter)?.count(session); // 3
```

## Find a layer in a stack

`findLayer` finds a layer in a stack by its class, so you can call its methods.
Each built-in layer's class is exported for this: `HttpCache`, `Scheduler`,
`Throttle`, and the transport's `SchemeTransport`.

```typescript
import { findLayer, HttpCache } from "@hyperjump/browser";

await findLayer(stack, HttpCache)?.purge("https://example.com/app.css");
```

## Where a response came from

`responseMeta` says which part of the stack made a response, the way devtools
says "from disk cache":

```typescript
import { responseMeta } from "@hyperjump/browser";

const response = await session.fetch("https://example.com/");
responseMeta(response).source; // "network"
responseMeta(response).cache; // "miss"
```
