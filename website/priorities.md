# Priorities

A browser loads what a page needs most first, and limits how many requests it
sends to a server at once. The `scheduler` layer limits requests to each server,
and the `throttle` layer holds back a page's low-priority requests while its
important ones load:

```typescript
import { Session, compose, httpCache, throttle, scheduler, defaultTransport } from "@hyperjump/browser";

const stack = compose(httpCache(), throttle(), scheduler())(defaultTransport());
const session = new Session(stack);

await session.fetch("https://example.com/hero.jpg", { priority: "high" });
```

Put `scheduler` right above the transport and `throttle` above it, both below
`httpCache`, so a response from the cache never waits.

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

## Hold back low-priority requests

While a page has an important request loading, the `throttle` layer only lets
one of its low-priority requests run at a time. When nothing important is
loading, it lets 10 run. Requests with priority `"auto"` or `"high"` are
important, and are never held back. That way, analytics and images below the
fold don't compete with the stylesheet the page is waiting for.

| Option | Description |
| --- | --- |
| `maxDelayable` | Low-priority requests in flight at once when nothing important is loading. The default is 10. |
| `maxDelayableWhileBusy` | Low-priority requests in flight at once while something important is loading. The default is 1. |
| `isDelayable` | Which requests can be held back. The default is requests with priority `"low"`. |
| `scope` | `"root"`, the default, counts a session and its child sessions as one page, like a page and its frames. `"session"` counts each session by itself. |

A held request whose priority you raise starts right away.
