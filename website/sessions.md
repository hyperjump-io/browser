# Sessions

A session is the requests that belong together, the way the requests of a page
load do. You create a session on a stack and fetch through it:

```typescript
import { Session } from "@hyperjump/browser";

const session = new Session(stack, {
  allowRetrieval: ["https://example.com/docs/"]
});

const page = await session.fetch("https://example.com/docs/index.html");
```

`session.fetch` takes the same arguments as `fetch`. Without a stack, a session
fetches `http:`, `https:`, and `data:` URLs with the runtime's `fetch`. For more
information about stacks, see [Layers](layers.md).

A session resolves a relative URL the way a browser does. In a browser, that's
against the page. In Node.js, it's against the working directory, so
`session.fetch("docs/index.html")` fetches a file. To resolve a URL that a
document refers to, resolve it against the document's URL yourself, such as
`new URL("main.css", page.url)`.

## Options

| Option | Description |
| --- | --- |
| `allowRetrieval` | The URLs the session can fetch. By default, it allows the working directory in Node.js and the page's origin in a browser. For more information, see [What a session can fetch](allow-retrieval.md). |
| `headers` | Headers for the requests to some URLs, such as credentials. For more information, see [Headers](#headers). |
| `maxRedirects` | How many redirects a request can follow before it's a network error. The default is 20. |
| `redirectSchemes` | The schemes a redirect can lead to. The default is `["http:", "https:"]`. For more information, see [Redirects](redirects.md). |

## Headers

A session's `headers` are by URL, so a credential goes only to the URLs it's
for, even when a document refers to URLs on other origins:

```typescript
const session = new Session(stack, {
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
const session = new Session(stack, {
  headers: {
    "https://api.example.com/": async () => ({ "Authorization": `Bearer ${await getToken()}` })
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
| `destination` | What the resource is for, such as `"document"`, `"style"`, or `"image"`, like `Request.destination` in a browser |
| `initiator` | The response of the request that caused this one, such as the document that referred to it |

## Close a session

Closing a session aborts every request it started that hasn't finished, the
way navigating away from a page does. After that, the session refuses new
requests:

```typescript
session.close();
```

A request's own `signal` still works too. Aborting it only aborts that request.

## Child sessions

A child session is a session nested in another one, like an iframe in a page:

```typescript
const frame = session.child({ allowRetrieval: ["https://example.com/widgets/"] });
```

A child session has these properties:

- It uses the same stack as its parent.
- It gets its parent's redirect options and `allowRetrieval` unless you give it
  its own.
- It gets its parent's headers. A key you give it replaces the same key of its
  parent's, so `{ "https://example.com/": {} }` takes that URL's headers away.
- It closes when its parent closes.

Layers keep state for each session, such as the requests it has in flight.
A child session has its own state, so layers keep its requests apart from its
parent's unless you set them up to share.
