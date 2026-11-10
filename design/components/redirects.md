# Redirects (`src/layers/redirects.js`)

The `Redirects` layer follows redirects one at a time, each as a new request
down the stack, instead of letting the runtime follow them inside the
transport. Every layer below it sees each URL:

- the HTTP cache stores a redirect as a response of its own, so a cacheable
  301 saves a round trip;
- the registry and the resource map answer where a redirect leads, and a
  registry entry can be a redirect, which makes it an alias;
- dedupe and the scheduler see the URLs that are really fetched.

It follows the Fetch standard:

- `redirect: "follow"`, `"error"`, or `"manual"`, from the request.
- A 301 or 302 makes a `POST` a `GET`, and a 303 makes anything but `GET` or
  `HEAD` a `GET`, without the body or the headers about it. A 307 or 308
  sends the method and body again, so a request with a body is cloned before
  each step, to have the body for the next.
- `Authorization` isn't sent to another origin.
- A URL a redirect leads to without a fragment gets the original's.
- More than 20 redirects (`max`) is a network error.

And it's stricter than `fetch` in one way: a redirect can only lead to
`http:` or `https:` (`schemes`), so a server can't send a request to
`file:`, even when the transport has it.

- The response has its final `url`, `redirected`, and the URLs it went
  through as `responseMeta(response).redirects`. Each redirect marks
  `redirect`, with its status and where it went from and to.
- It asks the transport for each step with `redirect: "manual"`. Node.js,
  Deno, and Bun return the 3xx. A browser returns an opaque redirect, which
  doesn't say where it leads, so the layer asks again with the request's
  own mode and the browser follows it.

## Where it goes

At the top of the stack, above everything that should see each step.

Rejected:

- Redirects followed by the session, above the stack, so every layer sees
  each step wherever it's added. The session would know about redirects, a
  stack used without a session wouldn't follow them, and a stack that wants
  the runtime to follow them couldn't leave them out. A layer at the top
  does the same, as long as it's at the top.
- Letting the runtime follow them. The layers would see only the first URL,
  the cache couldn't store a redirect, and a server could redirect a request
  anywhere the transport goes.

## Known limitations

- A layer above `Redirects` sees only the first request, so a redirect to a
  URL that layer answers goes past it.
- In a browser, the browser follows redirects, so the layers see only the
  first request, and its rules apply instead of `schemes`.
