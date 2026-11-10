# Sessions

A session is the requests that belong together, the way the requests of a page
load do. You create a session on a stack and fetch through it:

```typescript
import { Session } from "@hyperjump/browser";

const session = new Session(stack, {
  baseURL: "https://example.com/docs/",
  headers: { "User-Agent": "my-tool/1.0" }
});

const page = await session.fetch("index.html");
```

`session.fetch` takes the same arguments as `fetch`. Without a stack, a session
fetches `http:`, `https:`, and `data:` URLs with the runtime's `fetch`. For more
information about stacks, see [Layers](layers.md).

## Options

| Option | Description |
| --- | --- |
| `baseURL` | The URL that relative URLs are resolved against, like a document's base URL |
| `headers` | Headers that every request gets unless the request sets them itself |

The session sends `headers` to every URL it fetches, including where a redirect
leads. Don't put credentials in `headers` if the session fetches URLs on more
than one origin.

## Fetch options

Besides the options of `fetch`, `session.fetch` takes these:

| Option | Description |
| --- | --- |
| `cache` | A cache mode, as for `fetch`: `"default"`, `"no-store"`, `"reload"`, `"no-cache"`, `"force-cache"`, or `"only-if-cached"`. For more information, see [HTTP caching](http-caching.md). |
| `priority` | `"high"`, `"auto"`, or `"low"`, like `fetchpriority` in a browser |
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
const frame = session.child({ baseURL: "widgets/" });
```

A child session has these properties:

- It uses the same stack as its parent.
- It resolves its base URL against its parent's base URL.
- It gets its parent's headers unless you give it its own.
- It closes when its parent closes.

Layers keep state for each session, such as the requests it has in flight.
A child session has its own state, so its requests are kept apart from its
parent's unless a layer is set up to share them.
