# HTTP headers

To send headers with `http:` and `https:` requests, such as credentials,
replace the HTTP plugin with one that has a `headers` function. It's called
with the URL of each request.

```javascript
import { Hyperjump, HttpUriSchemePlugin, MemoryHttpCacheStore } from "@hyperjump/browser";

const h = new Hyperjump({ allowRetrieval: ["https://api.example.com/"] });
h.addUriSchemePlugin(new HttpUriSchemePlugin(h, {
  cache: new MemoryHttpCacheStore(),
  headers: (url) => url.origin === "https://api.example.com"
    ? { Authorization: `Bearer ${process.env.TOKEN}` }
    : undefined
}));
```

- **Send credentials only to the origins they're for.** Documents can
  reference any URL, so check the URL. Return `undefined` for no headers.
- **It can be async**, so you can refresh a token.
- **`Accept` is always the plugin's**, from the media types it supports.
- **Give it a cache.** Replacing the plugin replaces its cache too.

## Redirects

A redirected request is sent with the same headers. `fetch` drops
`Authorization` and `Cookie` on a redirect to another origin, but not other
headers.

## Caching

The headers are part of the request the cache sees, so it respects a
`Vary` on them. But the cache is private: a response retrieved with
credentials is used for a later request for the same URL, even one with
different headers, unless the response has a `Vary` for them. Don't share
a cache between plugins with different credentials.
