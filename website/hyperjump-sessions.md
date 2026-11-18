# Hyperjump sessions

A Hyperjump session is a `Hyperjump` instance. Its requests belong together, the
way the requests of a page load do. You create a session from a configuration
and fetch through it:

```typescript
import { Hyperjump } from "@hyperjump/browser";

const session = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});

const url = "https://swapi.hyperjump.io/api/films/1";
const response = await session.fetch(url);
```

`session.fetch` takes the same arguments as `fetch`. `browse` retrieves documents
with `session.fetch`, so what this page says about requests applies to the
documents it gets too. For more information, see [Browse to a URL](browse-to-a-url.md).
For more information about stacks, see [Layers](layers.md).

Without a stack, a session gets a default stack of its own:

- In Node.js, it's `scheduler()` on `nodeTransport()`. It fetches `http:`,
  `https:`, `data:`, and `file:` URLs, and limits how many requests go to each
  server at once. For more information, see [Priorities](priorities.md).
- In a browser, the stack is `defaultTransport()`, which fetches `http:`,
  `https:`, and `data:` URLs with the browser's `fetch`.

Each session without a stack gets a new one. To share one between sessions, so
they share its connection limits, put `defaultStack()` in the configuration that
you create them from:

```typescript
import { Hyperjump, defaultStack } from "@hyperjump/browser";

const config = { stack: defaultStack() };
const first = new Hyperjump(config);
const second = new Hyperjump(config);
```

The default stack has no HTTP cache. To cache responses, build your own stack.

The configuration is a plain object, so you can keep it and create another
session from it with `new Hyperjump(config)`. Sessions with the same stack
share what the stack keeps, such as an HTTP cache.

A session resolves a relative URL the way a browser does. In a browser, that's
against the page. In Node.js, it's against the working directory, so
`session.fetch("api/films/1.jref")` fetches a file. To resolve a URL that a
document refers to, resolve it against the document's URL yourself, such as
`new URL("../people/1", response.url)`. `browse` does this for you.

## Options

| Option | Description |
| --- | --- |
| `stack` | What the session fetches through: a transport, or layers on one. The default is a stack of the session's own. |
| `allowRetrieval` | The URLs the session can fetch. By default, it allows the working directory in Node.js and the page's origin in a browser. For more information, see [What a session can fetch](allow-retrieval.md). |
| `mediaTypes` | The media types documents can be in. The default is JRef and JSON. For more information, see [Media types](media-types.md). |
| `headers` | Headers for the requests to some URLs, such as credentials. For more information, see [Headers](#headers). |
| `registry` | Documents your app already has, which the session answers without fetching them. For more information, see [Registries](registries.md). |
| `maxRedirects` | How many redirects a request can follow before it's a network error. The default is 20. |
| `maxReferences` | How many references `browse` can follow in a row to reach a value before it's an error. The default is 20. For more information, see [Browse to a URL](browse-to-a-url.md#errors). |
| `redirectSchemes` | The schemes a redirect can lead to. The default is `["http:", "https:"]`. It can't include `file:`. For more information, see [Redirects](redirects.md). |

## Headers

A Hyperjump session's `headers` are by URL, so a credential goes only to the
URLs it's for, even when a document refers to URLs on other origins:

```typescript
const session = new Hyperjump({
  headers: {
    "https://api.example.com/": { "Authorization": `Bearer ${token}` },
    "https://example.com/private/": { "X-API-Key": key }
  }
});
```

A key that ends with `/` is for every URL under it, and any other key is only
for that URL. A key that's just an origin, like `https://example.com`, is for
the whole origin. The session compares keys as URLs, so a different case or a `..`
in a path doesn't get around them. It resolves a relative key the way it
resolves a relative URL.

When more than one key matches a URL, a longer key wins a header they both
have. A header that a request sets itself wins over all of them.

A value can be a function of the URL, and the function can be async, so it can
refresh a token. The session calls it for each request:

```typescript
const session = new Hyperjump({
  headers: {
    "https://api.example.com/": async () => ({
      "Authorization": `Bearer ${await getToken()}`
    })
  }
});
```

Each redirect gets the headers for the URL it leads to, not the ones for the URL
before it. A credential doesn't follow a redirect to another origin, or out of
the path it's for. Headers that a request sets itself follow redirects, as they
do with `fetch`, except `Authorization` to another origin.

To send a header to every URL, such as `User-Agent`, write a layer. For more
information, see [Layers](layers.md#write-a-layer).

Sessions on one stack share its HTTP cache. If they send different credentials
to the same URL, give each one a stack with its own cache store, unless the
server's responses have a `Vary` header for them.

## Fetch options

Besides the options of `fetch`, `session.fetch` takes these:

| Option | Description |
| --- | --- |
| `cache` | A cache mode, as for `fetch`: `"default"`, `"no-store"`, `"reload"`, `"no-cache"`, `"force-cache"`, or `"only-if-cached"`. For more information, see [HTTP caching](http-caching.md). |
| `priority` | `"high"`, `"auto"`, or `"low"`, like `fetchpriority` in a browser. For more information, see [Priorities](priorities.md). |
| `initiator` | The response of the request that caused this one, such as the document that referred to it. Only a `file:` document can refer to a `file:` URL. |
| `referrer` | The URL of the document the request comes from, for a document the session didn't fetch. It wins over the `initiator`'s URL. The session keeps it, and doesn't pass it to `fetch`. |

## Close a session

Closing a Hyperjump session aborts every request it started that hasn't
finished, the way navigating away from a page does. After that, the session
refuses new requests:

```typescript
session.close();
```

A request's own `signal` still works too. Aborting it only aborts that request.
