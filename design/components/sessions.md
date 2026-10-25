# `Hyperjump` and sessions (`src/hyperjump/hyperjump.js`)

State is separated by how long it lives.

| Level | Has |
| --- | --- |
| `Hyperjump` | Configuration: URI scheme and media type plugins, `allowRetrieval`, and (in the `http(s):` plugin) the HTTP cache |
| `Session` | A document cache, and browsing: `get`, `getDocument`, `step`, … |

- The long-lived level only has state that doesn't depend on a session.
  Plugins and HTTP responses are the same for every session.
- `hyperjump.session()` creates a session. There's no default session.
  Browsing is only on sessions, because a node needs its session to follow
  references.
- A session keeps each document it retrieves for as long as it's used. That
  gives each unit of work its own consistent set of documents, and a new
  session sees changes.
- The cache holds promises, so a document that's asked for again while it's
  being retrieved is only retrieved once. A failure isn't cached, so it can
  be tried again.
- A document is also cached under the URL its response came from, which can
  differ from the URI that was asked for (redirects, symlinks). References
  in it are relative to where it came from.
- Following a reference that leads back to a URI already in the chain is a
  `ReferenceCycleError`, rather than waiting forever.

## Extending

Applications build on `Hyperjump` and `Session` by subclassing them.

- Methods are declared as methods, not function-valued properties, so a
  subclass can override them.
- Every document lookup, including following references, goes through
  `getDocument`, so a subclass can find documents somewhere other than the
  cache or a URI scheme plugin. `getDocument` also returns the document
  itself, for what it has beyond its values.
- A media type plugin's `parse` gets the session the document is being
  retrieved in, so a media type that needs other resources to parse a
  document retrieves them in the same session.
- Types are generic over the node type, and documents over their node type,
  so a subclass's annotated trees are typed.
