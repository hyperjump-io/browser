# Priorities

A browser loads what a page needs most first, and limits how many requests it
sends to a server at once. The `scheduler` layer does the same:

```typescript
import { Session, compose, httpCache, scheduler, defaultTransport } from "@hyperjump/browser";

const stack = compose(httpCache(), scheduler())(defaultTransport())
const session = new Session(stack);

await session.fetch("https://example.com/hero.jpg", { priority: "high" });
```

Put `scheduler` right above the transport, so a response from the cache never
waits.

## Connection limits

By default, the scheduler lets 6 requests to each origin be in flight at once,
the limit browsers use for HTTP/1.1, and 256 in all. A request over a limit
waits for a slot. A request holds its slot until its body is read or cancelled,
so read or cancel every body.

| Option | Description |
| --- | --- |
| `perKey` | Requests in flight at once for each origin, or a function of the origin |
| `total` | Requests in flight at once in all |
| `key` | What shares a limit. The default is the origin of `http:` and `https:` requests. Other URLs aren't limited. |
| `releaseOn` | `"body"`, the default, frees a slot when the body is done. `"headers"` frees it when the response arrives. |

The limits belong to the layer, so every session on the same stack shares them,
the way a browser's tabs share its connections.

`stats()` says how many requests are in flight and waiting, for each origin:

```typescript
import { findLayer, Scheduler } from "@hyperjump/browser";

findLayer(stack, Scheduler)?.stats(); // { active: 6, queued: 2, byKey: { ... } }
```

## Priority

A request's `priority` is `"high"`, `"auto"`, or `"low"`, like `fetchpriority`
in a browser. Waiting requests start in that order, and in the order they came
for the same priority. A request that can start right away starts, whatever its
priority.

## Change a priority

A priority can change while the request waits, like an image that scrolls into
view. Pass a `PriorityController`'s signal instead of a string:

```typescript
import { PriorityController } from "@hyperjump/browser";

const priority = new PriorityController("low");
const image = session.fetch("https://example.com/photo.jpg", { priority: priority.signal });

// Later, when the image scrolls into view
priority.set("high");
```

A request that's already started keeps going as it is.

When requests share one request, such as with [`dedupe`](sharing-requests.md),
the shared request has the most urgent priority of the callers still waiting.
