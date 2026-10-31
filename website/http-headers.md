# HTTP headers

Requests are sent by the HTTP plugin, so to send headers such as credentials
with `http:` and `https:` requests, you replace the HTTP plugin with one that
has a `headers` function. The function is called with the URL of each request
and returns the headers to send:

```typescript
import {
  Hyperjump,
  HttpUriSchemePlugin,
  MemoryHttpCacheStore
} from "@hyperjump/browser";

const h = new Hyperjump({ allowRetrieval: ["https://api.example.com/"] });
h.addUriSchemePlugin(new HttpUriSchemePlugin({
  cache: new MemoryHttpCacheStore(),
  headers: (url) => url.origin === "https://api.example.com"
    ? { Authorization: `Bearer ${process.env.TOKEN}` }
    : undefined
}));
```

- **Send credentials only to the origins they're for.** Documents can
  reference any URL, so check the URL before returning credentials. Return
  `undefined` to send no headers.
- **It can be async.** That lets you refresh a token before returning it.
- **`Accept` is always set for you.** It lists the media types that are
  supported.
- **Give it a cache.** Replacing the plugin replaces its cache too, so the new
  plugin doesn't cache anything unless you give it a cache.

## Redirects

A redirected request is sent with the same headers unless it goes to another
origin. Then `fetch` drops `Authorization` and `Cookie` but keeps any other
headers.

## Caching

The headers are part of the request the cache sees, so the cache respects `Vary`
on them. But the cache is private, and that matters when credentials are
involved. A response retrieved with credentials will be used for a later
request to the same URL even if that request has different headers, unless the
response has a `Vary` for those headers. Don't share a cache between plugins
with different credentials.
