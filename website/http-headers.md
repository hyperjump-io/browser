# HTTP headers

The HTTP plugin sends `http:` and `https:` requests. To send headers such as
credentials with those requests, replace the default HTTP plugin with one that
has a `headers` option. Documents can refer to any URL, so headers sent with
every request could end up at any server. Instead, you give headers by URL, and
only the URLs you list get them:

```typescript
import { Hyperjump, HttpUriSchemePlugin } from "@hyperjump/browser";

const h = new Hyperjump({
  allowRetrieval: ["https://api.example.com/"],
  uriSchemePlugins: [new HttpUriSchemePlugin({
    headers: {
      "https://api.example.com/": {
        Authorization: `Bearer ${process.env.TOKEN}`
      }
    }
  })]
});
```

URLs match the way they do in [`allowRetrieval`](allow-retrieval.md). The plugin
sends the headers for a URL that ends with `/` with every request under that
URL. It sends the headers for any other URL only with requests to that exact
URL. The headers for an origin such as `https://api.example.com` go with every
request to it with or without the `/` because it's the URL of the origin's
root. Every URL in `headers` has to be an absolute `http:` or `https:` URL. This
plugin has no `cache` option, so it still uses the default
[cache](http-caching.md).

When more than one URL matches a request, the plugin merges their headers and
the longer URL's headers win. That way an API can have one token and a path
under it can have another. You don't need to set `Accept`. The plugin always
sets it to the media types that the `Hyperjump` supports.

## Headers that change

Instead of headers, you can give a URL a function that returns them. The plugin
calls it with the URL of each request it matches. It can be async, which lets
you refresh a token before the plugin sends it:

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

In Node.js, the session follows each redirect with a new request, so every
request gets the headers for its own URL. Suppose your token is for
`https://api.example.com/` and the API redirects a request to
`https://cdn.example.net/`. The request to `https://cdn.example.net/` doesn't
get the token.

In a browser, `fetch` follows redirects itself and sends the same headers to
wherever the redirect leads. When the redirect goes to another origin, `fetch`
removes `Authorization` and `Cookie` but sends every other header. If you send
credentials from a browser, put them in `Authorization` so that a redirect to
another origin doesn't send them.

## Caching

The cache keeps each URL's responses separately, so one plugin can send
different credentials to different URLs.

Different credentials for the same URL are another matter. The cache is
private, which means it's for one user. When a response for a URL came from a
request with credentials, the cache uses it for later requests to the same URL
even when those requests send different credentials. The only exception is a
response with a `Vary` header that names the headers that differ. The cache
gets every header that the plugin sends so it can respect that `Vary`.

Suppose Alice and Bob each have their own token for
`https://api.example.com/me`. If their requests share a cache, Bob's request can
get the response to Alice's request with her token. To keep them apart, give
each user a `Hyperjump` with its own plugin:

```typescript
import { Hyperjump, HttpUriSchemePlugin } from "@hyperjump/browser";

const hyperjumpFor = (token: string) => new Hyperjump({
  allowRetrieval: ["https://api.example.com/"],
  uriSchemePlugins: [new HttpUriSchemePlugin({
    headers: {
      "https://api.example.com/": { Authorization: `Bearer ${token}` }
    }
  })]
});

const alice = hyperjumpFor(await getToken("alice"));
const bob = hyperjumpFor(await getToken("bob"));
```

Each call creates a new plugin with its own default cache, so Bob never gets a
response to a request with Alice's token. If you give the plugins a cache
yourself, don't give them the same one.
