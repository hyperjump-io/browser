# HTTP headers

Requests are sent by the HTTP plugin, so to send headers such as credentials
with `http:` and `https:` requests, you configure an HTTP plugin with
`headers`. It replaces the default one. Documents can reference any URL, so
headers are given by URL and only the URLs you list get them:

```typescript
import { Hyperjump, HttpUriSchemePlugin } from "@hyperjump/browser";

const h = new Hyperjump({
  allowRetrieval: ["https://api.example.com/"],
  uriSchemePlugins: [new HttpUriSchemePlugin({
    headers: {
      "https://api.example.com/": { Authorization: `Bearer ${process.env.TOKEN}` }
    }
  })]
});
```

A URL that ends with `/` gets its headers for everything under it, and any other
URL gets them only for itself. That's the same rule
[`allowRetrieval`](allow-retrieval.md) uses. The URLs have to be absolute
`http:` or `https:` URLs. The plugin still has the default
[cache](http-caching.md) because it wasn't given a different one.

When more than one URL matches a request, their headers are merged and the
longer URL's headers win, so an API can have one token and a path under it can
have another. `Accept` is always set for you, because it lists the media types
that are supported.

## Headers that change

Instead of headers, a URL can have a function that returns them. It's called
with the URL of each request it matches and can be async, which lets you
refresh a token before it's sent:

```typescript
new HttpUriSchemePlugin({
  headers: {
    "https://api.example.com/": async () => ({
      Authorization: `Bearer ${await getToken()}`
    })
  }
});
```

Return `undefined` to send no headers for that request.

## Redirects

A redirected request is sent with the same headers unless it goes to another
origin. Then `fetch` drops `Authorization` and `Cookie` but keeps any other
headers.

## Caching

The headers are part of the request the cache sees, so the cache respects `Vary`
on them, and responses are cached by URL, so different credentials for
different URLs can share one plugin. But the cache is private. A response
retrieved with credentials will be used for a later request to the same URL
even if that request has different headers, unless the response has a `Vary`
for those headers. Different credentials for the same URL, such as one for each
user, need plugins that don't share a cache.
