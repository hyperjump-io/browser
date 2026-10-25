# HTTP headers

To send headers with `http(s):` requests, such as credentials, give the
`HttpUriSchemePlugin` a `headers` function. It's called with the URL of each
request, so credentials can be sent only to the origins they're for. It can
be async, so you can refresh a token. The `Accept` header is always the
plugin's. The headers are part of the request the cache sees, so it respects
a `Vary` on them. Don't share a cache between plugins with different
credentials.

```javascript
import { Hyperjump, HttpUriSchemePlugin, MemoryHttpCacheStore } from "@hyperjump/browser";

const h = new Hyperjump();
h.addUriSchemePlugin(new HttpUriSchemePlugin(h, {
  cache: new MemoryHttpCacheStore(),
  headers: (url) => url.origin === "https://api.example.com"
    ? { Authorization: `Bearer ${process.env.TOKEN}` }
    : undefined
}));
```
