# HTTP headers

To send headers such as credentials with `http:` and `https:` requests,
replace the HTTP plugin with one that has a `headers` function. It's called
with the URL of each request.

```typescript
import {
  Hyperjump,
  HttpUriSchemePlugin,
  MemoryHttpCacheStore
} from "@hyperjump/browser";

const h = new Hyperjump({ allowRetrieval: ["https://api.example.com/"] });
h.addUriSchemePlugin(new HttpUriSchemePlugin(h, {
  cache: new MemoryHttpCacheStore(),
  headers: (url) => url.origin === "https://api.example.com"
    ? { Authorization: `Bearer ${process.env.TOKEN}` }
    : undefined
}));
```

- **Send credentials only to the origins they're for.** Documents can
  reference any URL, so check the URL. Return `undefined` to send no
  headers.
- **It can be async.** That lets you refresh a token.
- **The plugin always sets `Accept`.** It lists the media types the plugin
  supports.
- **Give it a cache.** Replacing the plugin replaces its cache too.

## Redirects

A redirected request is sent with the same headers. On a redirect to
another origin, `fetch` drops `Authorization` and `Cookie`. It keeps any
other headers.

## Caching

The headers are part of the request the cache sees, so it respects `Vary`
on them. But the cache is private. A response retrieved with credentials
will be used for a later request to the same URL, even if that request has
different headers. The only exception is when the response has a `Vary`
for those headers. Don't share a cache between plugins with different
credentials.
