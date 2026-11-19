# Redirects

A Hyperjump session follows redirects itself, instead of letting the runtime
follow them inside the transport. Each redirect is a new request down the stack,
so every layer works with each step:

- The HTTP cache stores the redirects themselves, so a cached 301 saves a round
  trip.
- A [layer](layers.md#write-a-layer) that answers a URL itself answers where a
  redirect leads, and it can answer with a redirect, which makes a URL an
  alias.

## What it follows

It follows redirects the way `fetch` does:

- It uses the request's `redirect` option: `"follow"`, `"error"`, or
  `"manual"`.
- A 301 or 302 changes a `POST` to a `GET`, and a 303 changes anything but `GET`
  and `HEAD` to a `GET`. Either way, the body isn't sent again.
- A 307 or 308 sends the same method and body again.
- It doesn't send `Authorization`, `Cookie`, or `Proxy-Authorization` to
  another origin.
- Each step gets the Hyperjump session's headers for the URL it leads to. For
  more information, see [Hyperjump sessions](hyperjump-sessions.md#headers).
- More than 20 redirects is a network error. To change that, use the session's
  `maxRedirects` option.

A redirect can only lead to an `http:` or `https:` URL. To allow other schemes,
use the session's `redirectSchemes` option:

```typescript
const session = new Hyperjump({
  allowRetrieval: ["https://example.com/"],
  redirectSchemes: ["http:", "https:", "data:"]
});
```

A redirect can never lead to a `file:` URL, so a server can't choose which of
your files a request reads. `redirectSchemes` can't include `file:`, and
`new Hyperjump` throws a `TypeError` if it does. To answer a URL with a file,
use a [registry](registries.md) or a [layer](layers.md).

A redirect can only lead to a URL that the session's `allowRetrieval` allows.
For more information, see [What a session can fetch](allow-retrieval.md).

## Where a response went

The response has the URL it ended at as `response.url`, and
`response.redirected` is `true`. `responseMeta(response).redirects` lists every
URL it went through:

```typescript
import { responseMeta } from "@hyperjump/browser";

const response = await session.fetch("https://example.com/old");
responseMeta(response).redirects;
// ["https://example.com/old", "https://example.com/new"]
```

## In a browser

A browser doesn't let a script see where a redirect leads, so in a browser, the
browser follows redirects, and the layers only see the first request.

The session sends a redirected request twice in a browser: once to learn that
it's a redirect, and once for the browser to follow it. It only sends a request
again if its method is idempotent: `GET`, `HEAD`, `OPTIONS`, `TRACE`, `PUT`, or
`DELETE`. Any other method, such as `POST`, would make the server do what it
asks twice, so the session doesn't follow its redirect. The request fails with
`ERR_REDIRECT_NOT_FOLLOWED`, after the server got it. To get the redirect
instead, use `redirect: "manual"`. With `redirect: "manual"` or `"error"`, the
session sends a request once.

The session can't tell which URL the browser follows a redirect to, so the
browser's request to it doesn't get the session's
[headers](hyperjump-sessions.md#headers). A credential doesn't go to wherever a
server redirects to, but a redirect to a URL that needs one fails.
