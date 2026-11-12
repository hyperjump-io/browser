# Batch requests

Some APIs can answer several requests at once, like `/users?ids=1,2,3`. The
`batch` layer collects requests made at about the same time and gives them to
your `execute` function, which sends them and returns a response for each:

```typescript
import { batch } from "@hyperjump/browser";

const users = batch({
  match: (request) => new URL(request.url).pathname.startsWith("/users/") ? "users" : undefined,
  execute: async (requests, inner, ctx) => {
    const ids = requests.map((request) => new URL(request.url).pathname.split("/").pop());
    const batched = new Request(`https://api.example.com/users?ids=${ids.join(",")}`, { signal: ctx.session.signal });
    const response = await inner.fetch(batched, ctx);
    const byId = await response.json();
    return ids.map((id) => Response.json(byId[id]));
  }
});
```

`match` returns a key for requests that can go together, or `undefined` to pass
a request on. `execute` gets the requests that have the same key, and returns
one response for each, in the same order.

The request that `execute` sends belongs to the batch, not to one caller, so give
it the session's signal. Then closing the session stops it, and a caller that
gives up doesn't stop it for the others.

| Option | Description |
| --- | --- |
| `match` | A key for requests that can go together, or `undefined` |
| `execute` | Sends the requests and returns a response for each, in order |
| `windowMs` | How long to wait for more requests. The default, `0`, sends the batch at the end of the current task. |
| `maxSize` | The number of requests that sends a batch right away |

If a caller cancels its request before the layer sends its batch, the layer
takes the request out of the batch. A caller that cancels later only stops
waiting, and the rest of the batch still gets its responses.
