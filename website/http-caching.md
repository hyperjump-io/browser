# HTTP caching

`http:` and `https:` responses are cached according to their caching
headers. It works the way a private browser cache does:

- A fresh response is used without making a request.
- A stale response is revalidated if it has an `ETag` or `Last-Modified`
  header. An unchanged document isn't downloaded again.
- Concurrent requests for the same URL share one request.

Every session from the same `Hyperjump` shares the cache, so a new session
only retrieves what has changed.

## Where responses are kept

| Environment | Default |
| --- | --- |
| Node.js | In memory for the life of the process |
| Browsers | No cache of its own, because `fetch` already caches |

To change it, replace the HTTP plugin with one that has a different cache:

```typescript
import {
  FileHttpCacheStore,
  Hyperjump,
  HttpUriSchemePlugin
} from "@hyperjump/browser";

const h = new Hyperjump();

// Keep responses on disk, so they outlive the process
h.addUriSchemePlugin(new HttpUriSchemePlugin(h, {
  cache: new FileHttpCacheStore("./.cache/hyperjump")
}));

// Don't cache
h.addUriSchemePlugin(new HttpUriSchemePlugin(h));
```

To keep them somewhere else, like Redis, implement `HttpCacheStore`. It's
an object with async `get(url)`, `set(url, entry)`, and `delete(url)`
methods. Entries are JSON, so they can be stored anywhere.

The cache is private. Don't share one between plugins that send different
credentials. See [HTTP headers](http-headers.md).
