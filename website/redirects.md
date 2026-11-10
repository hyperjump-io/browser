# Redirects

Without the `redirects` layer, the runtime follows redirects inside the
transport, and the other layers only see the first request. With it at the top
of your stack, each redirect is a new request down the stack:

```typescript
import { Session, compose, redirects, httpCache, defaultTransport } from "@hyperjump/browser";

const stack = compose(redirects(), httpCache())(defaultTransport());
const session = new Session(stack);
```

That lets the other layers work with each step:

- The HTTP cache stores the redirects themselves, so a cached 301 saves a round
  trip.
- A [registry](registry.md) answers where a redirect leads, and a registry
  entry can be a redirect, which makes it an alias:

  ```typescript
  registry({
    entries: { "https://example.com/latest.json": { status: 302, headers: { Location: "/v2.json" } } }
  });
  ```

Put `redirects` first in the stack. A layer before it only gets the first
request.

## What it follows

It follows redirects the way `fetch` does:

- It uses the request's `redirect` option: `"follow"`, `"error"`, or
  `"manual"`.
- A 301 or 302 changes a `POST` to a `GET`, and a 303 changes anything but `GET`
  and `HEAD` to a `GET`. Either way, the body isn't sent again.
- A 307 or 308 sends the same method and body again.
- It doesn't send `Authorization` to another origin.
- More than 20 redirects is a network error. To change that, use the `max`
  option.

A redirect can only lead to an `http:` or `https:` URL, so a server can't send
a request to a `file:` URL. To allow other schemes, use the `schemes` option.

## Where a response went

The response has the URL it ended at as `response.url`, and
`response.redirected` is `true`. `responseMeta(response).redirects` lists every
URL it went through:

```typescript
import { responseMeta } from "@hyperjump/browser";

const response = await session.fetch("https://example.com/old");
responseMeta(response).redirects; // ["https://example.com/old", "https://example.com/new"]
```

## In a browser

A browser doesn't let a script see where a redirect leads, so in a browser, the
browser follows redirects, and the layers below only see the first request.
