# Layers

A stack is a series of layers, each one wrapping the one below it. A request
goes in at the top and comes out at the bottom, at a transport that retrieves
it. Each layer can answer the request itself, change it, or pass it on.

## Build a stack

`compose` puts layers on a transport. The first layer is the top of the stack,
so it sees each request first:

```typescript
import { Session, compose, defaultTransport } from "@hyperjump/browser";

const stack = compose(first(), second())(defaultTransport());
const session = new Session(stack);
```

That's the same as wrapping each layer by hand:

```typescript
const stack = first()(second()(defaultTransport()));
```

A stack is a fetcher, like a transport or a single layer, so you can give any
part of a stack to a session, or wrap a stack in more layers.

## Write a layer

`layer` makes a layer from a function. The function gets the request, its
context, and the fetcher below it. This one adds a header to every request:

```typescript
import { layer } from "@hyperjump/browser";

const auth = layer(async (request, ctx, inner) => {
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${await getToken()}`);
  return inner.fetch(new Request(request, { headers }), ctx);
});

const stack = compose(auth)(defaultTransport());
```

A layer that needs methods or state of its own is a class with an `inner`
property and a `fetch` method. The built-in layers are classes, and each one
has a function that makes it.

## The context

Each request goes down the stack with a context:

| Property | Description |
| --- | --- |
| `session` | The session the request is in |
| `cacheMode` | The request's cache mode, from `fetch(url, { cache })` |
| `signal` | Aborts when the caller aborts or the session closes |
| `priority` | The request's priority, which can change while it waits. Read `priority.value`. |
| `destination` | What the resource is for, or `""` |
| `record` | The request's record. Call `record.mark(name, detail)` to say what your layer did. |

To give the layer below a different value, pass it a copy of the context, such
as `inner.fetch(request, { ...ctx, signal })`.

A layer that keeps state for each session uses `ctx.session.state`, with the
layer itself as the key, so one stack can serve many sessions:

```typescript
const inFlight = ctx.session.state(this, () => new Map());
```

## Find a layer in a stack

`findLayer` finds a layer in a stack by its class, so you can call its methods:

```typescript
import { findLayer, HttpCache } from "@hyperjump/browser";

await findLayer(stack, HttpCache)?.purge("https://example.com/app.css");
```

## Where a response came from

`responseMeta` says which part of the stack made a response, the way devtools
shows "(from disk cache)":

```typescript
import { responseMeta } from "@hyperjump/browser";

const response = await session.fetch("https://example.com/");
responseMeta(response).source; // "network"
responseMeta(response).cache; // "miss"
```
