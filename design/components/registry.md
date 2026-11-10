# The registry (`src/layers/registry.js`)

Documents the application already has, like a bundled copy of a well-known
document, are answered before anything is fetched. It's like a cache that
nothing that goes through it is written to.

- Its entries are copied when the layer is made, so what it answers is fixed.
  `resolve` answers what isn't in them, like a directory for a URL prefix,
  for what can't be listed up front.
- An entry is a body, the parts of a response, or a function that makes a
  response. Each request gets a new response, because a body can only be
  read once.
- A URL is looked up without its fragment, which isn't part of what's
  fetched, and the response's URL doesn't have one.
- A body without a `Content-Type` gets its URL's extension's (see
  [The `file:` scheme](file-scheme.md)).
- Only `GET` and `HEAD` are answered. Anything else is passed on.
- `onMiss: "error"` makes what isn't registered a network error, so only
  what's registered can be fetched, like a sealed environment for tests.

Rejected:

- Adding what's passed on to the registry. That would be a cache, which a
  registry isn't.
- A list of documents given to the session. A layer answers wherever it's
  put in the stack, so an application decides what comes before it.
