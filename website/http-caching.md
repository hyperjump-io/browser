# HTTP caching

`http(s):` responses are cached according to their caching headers, as a
private cache would cache them. A stale response is revalidated if it has an
`ETag` or `Last-Modified` header. Every session from the same `Hyperjump`
shares the cache, so a new session only retrieves what has changed. Sessions
that retrieve the same URL at the same time share one request.

In Node.js, responses are cached in memory by default. Use a
`FileHttpCacheStore` to keep them on disk, so they outlive the process, or
implement `HttpCacheStore` to keep them somewhere else. In a browser, `fetch`
already caches, so there's no cache by default.

```javascript
import { FileHttpCacheStore, Hyperjump, HttpUriSchemePlugin } from "@hyperjump/browser";

const h = new Hyperjump();
const cache = new FileHttpCacheStore("./.cache/hyperjump");
h.addUriSchemePlugin(new HttpUriSchemePlugin(h, { cache }));

// No cache
h.addUriSchemePlugin(new HttpUriSchemePlugin(h));
```
