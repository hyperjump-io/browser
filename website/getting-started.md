# Get started

This tutorial builds a stack that loads a page the way a browser does: it
follows redirects, shares requests that are the same, caches responses, and
loads the style sheet before the images. Then it shows you what happened.

## Build a stack

A stack is layers on top of a transport. Each layer wraps the one below it, and
`compose` lists them from the top down:

```typescript
import {
  Session, Trace, compose, nodeTransport,
  destinationPriority, httpCache, throttle, scheduler
} from "@hyperjump/browser";

const stack = compose(
  destinationPriority(),
  httpCache(),
  throttle(),
  scheduler()
)(nodeTransport());
```

The order matters, the way it does in a browser:

1. `destinationPriority` gives each request a priority from what it's for, so
   the layers below can use it.
2. `httpCache` answers what it has before anything waits for a connection.
3. `throttle` holds back low-priority requests while important ones load.
4. `scheduler` limits how many requests go to each server at once.

`nodeTransport()` fetches `http:`, `https:`, `data:`, and `file:` URLs. In a
browser, use `defaultTransport()`, which doesn't have `file:`.

There's no layer for redirects. The session follows them, and each step goes
down the whole stack. For more information, see [Redirects](redirects.md).

## Load a page

A session is the requests that belong together, like a page load. Create one on
the stack, and fetch the page:

```typescript
const session = new Session(stack, { allowRetrieval: ["https://example.com/"] });
const trace = new Trace(session);

const page = await session.fetch("https://example.com/index.html", { destination: "document" });
const html = await page.text();
```

`session.fetch` works like `fetch`. The `destination` says what the resource is
for, which is how the stack knows a document is important. A session fetches
only what its `allowRetrieval` allows, so a page can't make it fetch whatever
the page names. For more information, see
[What a session can fetch](allow-retrieval.md).

Now load what the page refers to. A reference is relative to the page it's in, so
resolve it against `page.url`. Pass the page's response as the `initiator`, so
the trace knows what caused each request:

```typescript
await Promise.all([
  session.fetch(new URL("main.css", page.url), { destination: "style", initiator: page }),
  session.fetch(new URL("hero.jpg", page.url), { destination: "image", initiator: page }),
  session.fetch(new URL("footer.jpg", page.url), { destination: "image", initiator: page })
].map(async (response) => (await response).arrayBuffer()));
```

The style sheet gets a high priority, and the images get a low one. While the
style sheet loads, the throttle lets only one image through.

Read or cancel every body. A request keeps its connection until you finish
with its body.

## See what happened

The trace recorded every request:

```typescript
console.log(trace.waterfall());
```

Each row is a request, under the request that caused it, with where its
response came from and a bar for when it waited and loaded. For more
information, see [Tracing](tracing.md).

## Load it again

Fetch the page again in a new session on the same stack:

```typescript
const again = new Session(stack, { allowRetrieval: ["https://example.com/"] });
await (await again.fetch("https://example.com/index.html")).text();
```

The HTTP cache belongs to the stack, so the new session gets the page from the
cache if it's still fresh, the way a new tab does.

## Close the session

When you're done with a page, close its session. Like navigating away, it stops
everything the session started that hasn't finished:

```typescript
session.close();
```

## What's next

- [Sessions](sessions.md): options and closing
- [Layers](layers.md): write your own layers
- [HTTP caching](http-caching.md): cache modes and keeping responses on disk
- [Priorities](priorities.md): connection limits and what loads first
