# HTTP headers

Requests are sent by the HTTP plugin, so to send headers such as credentials
with `http:` and `https:` requests, you replace the default HTTP plugin with one
configured with `headers`. Documents can reference any URL, so headers sent with
every request could end up at any server. Instead, headers are given by URL.
Only the URLs you list get them:

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

URLs match the way they do in [`allowRetrieval`](allow-retrieval.md). Headers
for a URL that ends with `/` are sent with every request under that URL. Headers
for any other URL are sent only with requests to that exact URL. Every URL in
`headers` has to be an absolute `http:` or `https:` URL. This plugin wasn't
given a `cache`, so the default [cache](http-caching.md) still applies.

When more than one URL matches a request, their headers are merged and the
longer URL's headers win. So, an API can have one token and a path under it can
have another. You don't need to set `Accept`. It's always set to the media
types that are supported.

## Headers that change

Instead of headers, a URL can be given a function that returns them. It's called
with the URL of each request it matches and can be async, which lets you refresh
a token before it's sent:

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

Each URL's responses are cached separately, so one plugin can send different
credentials to different URLs.

Different credentials for the same URL are another matter. The cache is private,
which means it's meant for one user. A response retrieved with credentials is
used for later requests to the same URL even when those requests send different
credentials. The only exception is a response with a `Vary` header that names
the headers that differ. The cache sees every header that's sent, so it can
respect that `Vary`.

Say Alice and Bob each have their own token for `https://api.example.com/me`. If
their requests share a cache, Bob's request can get the response that was
retrieved with Alice's token, and Bob sees Alice's account. To keep them apart,
give each user a `Hyperjump` with its own plugin:

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

Each call creates a new plugin with its own default cache. Bob never gets a
response that was retrieved with Alice's token. If you give the plugins a cache
yourself, don't give them the same one.
