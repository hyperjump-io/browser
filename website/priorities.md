# Priorities

A browser loads what a page needs most first, and limits how many requests it
sends to a server at once. The `scheduler` layer limits requests to each server,
and the `throttle` layer holds back a page's low-priority requests while its
important ones load:

```typescript
import {
  Hyperjump,
  compose,
  httpCache,
  nodeTransport,
  scheduler,
  throttle
} from "@hyperjump/browser";

const layers = compose(httpCache(), throttle(), scheduler());
const stack = layers(nodeTransport());
const session = new Hyperjump({
  stack,
  allowRetrieval: ["https://example.com/"]
});

await session.fetch("https://example.com/hero.jpg", { priority: "high" });
```

Put `scheduler` last, right before the transport, with `throttle` before it,
and both after `httpCache`, so a response from the cache never waits.

## Connection limits

By default, the scheduler lets 6 requests to each origin be in flight at once,
the limit browsers use for HTTP/1.1, and 256 in all. A request over a limit
waits for a slot. A request holds its slot until you read or cancel its body,
so read or cancel every body.

| Option | Description |
| --- | --- |
| `perKey` | Requests in flight at once for each origin, or a function of the origin |
| `total` | Requests in flight at once in all |
| `key` | What shares a limit. The default is the origin of `http:` and `https:` requests. Other URLs aren't limited. |
| `releaseOn` | `"body"`, the default, frees a slot when you finish with the body. `"headers"` frees it when the response arrives. |

The limits belong to the layer, so every Hyperjump session on the same stack
shares them, the way a browser's tabs share its connections.

`stats()` says how many requests are in flight and waiting, for each origin:

```typescript
import { findLayer, Scheduler } from "@hyperjump/browser";

findLayer(stack, Scheduler)?.stats();
// { active: 6, queued: 2, byKey: { ... } }
```

## Priority

A request's `priority` is `"high"`, `"auto"`, or `"low"`, like `fetchpriority`
in a browser. Waiting requests start in that order, and in the order they came
for the same priority. A request that can start right away starts, whatever its
priority.

## Change a priority

A priority can change while the request waits, like an image that scrolls into
view, or a document that an app loads ahead of time and then needs. Pass a
`PriorityController`'s signal instead of a string. `session.fetch` and `browse`
both take one:

```typescript
import { PriorityController, browse } from "@hyperjump/browser";

const priority = new PriorityController("low");
const loading = browse(session, "https://example.com/films/2", {
  priority: priority.signal
});

// Later, when the reader opens the film
priority.set("high");
```

A request that already started keeps its priority. For more information about
`browse`'s priority, see [Browse to a URL](browse-to-a-url.md#priority).

## Hold back low-priority requests

While a page has an important request loading, the `throttle` layer only lets
one of its low-priority requests run at a time. When nothing important is
loading, it lets 10 run. Requests with priority `"auto"` or `"high"` are
important, and are never held back. This keeps analytics and images below the
fold from competing with the style sheet the page is waiting for.

| Option | Description |
| --- | --- |
| `maxDelayable` | Low-priority requests in flight at once when nothing important is loading. The default is 10. |
| `maxDelayableWhileBusy` | Low-priority requests in flight at once while something important is loading. The default is 1. |
| `isDelayable` | Which requests the throttle can hold back. The default is requests with priority `"low"`. |

A held request whose priority you raise starts right away.
