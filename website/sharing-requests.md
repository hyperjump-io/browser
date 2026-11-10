# Share requests

When a page uses the same image twice, a browser loads it once. The `dedupe`
layer does the same: requests that are the same, made while one is in flight,
share one request, and each caller gets its own copy of the response:

```typescript
import { Session, compose, dedupe, httpCache, defaultTransport } from "@hyperjump/browser";

const stack = compose(dedupe(), httpCache())(defaultTransport());
const session = new Session(stack);

// One request
const [a, b] = await Promise.all([
  session.fetch("https://example.com/logo.png"),
  session.fetch("https://example.com/logo.png")
]);
```

Put `dedupe` above `httpCache`, so requests that miss the cache at the same time
are still one request.

## What's the same

By default, `GET` and `HEAD` requests are the same when they have the same URL,
cache mode, and headers. To decide yourself, use the `key` option. Return a
string, or `undefined` to leave a request out:

```typescript
dedupe({
  key: (request) => request.method === "GET" ? request.url : undefined
});
```

## Aborting

Each caller can abort its own request. That only ends its own wait, and the
others still get the response. When every caller has given up, the shared
request is stopped.

## Sessions and frames

Each session shares only its own requests. To share requests between a session
and its child sessions, like a page and its frames, use
`dedupe({ scope: "root" })`. Then a frame that closes only stops its own wait,
even if it made the request that the page joined.
