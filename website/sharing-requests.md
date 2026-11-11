# Share requests

Two layers share requests: `dedupe` makes requests that are the same into one,
and `batch` sends requests that go together as one.

## Dedupe

When a page uses the same image twice, a browser loads it once. The `dedupe`
layer does the same: requests that are the same, made while one is in flight,
share one request, and each caller gets its own copy of the response:

```typescript
import { Session, compose, dedupe, httpCache, defaultTransport } from "@hyperjump/browser";

const stack = compose(dedupe(), httpCache())(defaultTransport());
const session = new Session(stack, { baseURL: "https://example.com/" });

// One request
const [a, b] = await Promise.all([
  session.fetch("https://example.com/logo.png"),
  session.fetch("https://example.com/logo.png")
]);
```

Put `dedupe` before `httpCache`, so requests that miss the cache at the same time
are still one request.

### What's the same

By default, `GET` and `HEAD` requests are the same when they have the same URL,
cache mode, and headers. To decide yourself, use the `key` option. Return a
string, or `undefined` to leave a request out:

```typescript
dedupe({
  key: (request) => request.method === "GET" ? request.url : undefined
});
```

### Aborting

Each caller can cancel its own request with its `signal`. That only ends its
own wait, and the others still get the response. When every caller has given
up, the layer stops the shared request.

### Sessions and frames

Each session shares only its own requests. To share requests between a session
and its child sessions, like a page and its frames, use
`dedupe({ scope: "root" })`. Then a frame that closes only stops its own wait,
even if it made the request that the page joined.

## Batch

Some APIs can answer several requests at once, like `/users?ids=1,2,3`. The
`batch` layer collects requests made at about the same time and gives them to
your `execute` function, which sends them and returns a response for each:

```typescript
import { batch } from "@hyperjump/browser";

const users = batch({
  match: (request) => new URL(request.url).pathname.startsWith("/users/") ? "users" : undefined,
  execute: async (requests, inner, ctx) => {
    const ids = requests.map((request) => new URL(request.url).pathname.split("/").pop());
    const response = await inner.fetch(new Request(`https://api.example.com/users?ids=${ids.join(",")}`), ctx);
    const byId = await response.json();
    return ids.map((id) => Response.json(byId[id]));
  }
});
```

`match` returns a key for requests that can go together, or `undefined` to pass
a request on. `execute` gets the requests that have the same key, and returns
one response for each, in the same order.

| Option | Description |
| --- | --- |
| `match` | A key for requests that can go together, or `undefined` |
| `execute` | Sends the requests and returns a response for each, in order |
| `windowMs` | How long to wait for more requests. The default, `0`, sends the batch at the end of the current task. |
| `maxSize` | The number of requests that sends a batch right away |
| `scope` | `"session"`, the default, or `"root"` to batch a session's requests with its child sessions' |

If a caller cancels its request before the layer sends its batch, the layer
takes the request out of the batch. A caller that cancels later only stops
waiting, and the rest of the batch still gets its responses.
