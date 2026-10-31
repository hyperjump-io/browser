# Media types (`src/hyperjump/media-types/`)

A media type plugin parses a response into a document, and says what its
fragments identify. JSON and JRef are built in.

- A response is parsed by the plugin with the most specific match for its
  `Content-Type`. If there's a tie, the plugin that was added first wins.
- `content-type` v3 doesn't throw for a malformed header, so the type is
  validated, to keep rejecting an invalid `Content-Type`.
- The `Accept` header lists every plugin with its quality, `q=0` included,
  and `*/*` last. `Hyperjump.retrieve` gives it to the URI scheme plugin
  (`options.accept`).
- A response without a `Content-Type` gets the media type of its URL's
  extension, in `Hyperjump.retrieve`. That's how a file gets one. The
  `http(s):` plugin rejects a response without one, because a URL's
  extension doesn't say what's at it.
- URI scheme plugins don't get the `Hyperjump`. Before 2026-10-30, they
  were constructed with it, and the `http(s):` plugin only used it for the
  `Accept` header and the `file:` plugin for a file's media type, which
  made the client and its plugins depend on each other. What they needed
  is a value `retrieve` gives them, or something it does with what they
  return.
- A file's media type is the plugin with the longest matching extension, so
  a plugin for `.schema.json` takes precedence over the JSON plugin, whatever
  order they were added in. Before, the first plugin with a matching
  extension won.
- A plugin's `fragmentPointer` turns a fragment into a JSON Pointer, so a
  media type defines what its fragments identify, like anchors. Each
  document records the media type of the plugin that parsed it, so `get`
  knows which plugin to ask. A plugin can set another one on the document
  it returns, for a document it found to be in a more specific media type,
  like JSON that's a JSON Schema, so that media type's plugin reads its
  fragments. A media type that doesn't define fragments
  identifies the whole document. This replaced the `anchors` and
  `fragmentKind` document properties, which only one media type used.
- `parse` gets the session the document is being retrieved in (see
  [Sessions](sessions.md#extending)).
