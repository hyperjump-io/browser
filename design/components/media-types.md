# Media types (`src/hyperjump/media-types/`)

A media type plugin parses a response into a document, and says what its
fragments identify. JSON and JRef are built in.

- A response is parsed by the plugin with the most specific match for its
  `Content-Type`. If there's a tie, the plugin that was added first wins.
- `content-type` v3 doesn't throw for a malformed header, so the type is
  validated, to keep rejecting an invalid `Content-Type`.
- The `Accept` header lists every plugin with its quality, `q=0` included,
  and `*/*` last.
- A file's media type is the plugin with the longest matching extension, so
  a plugin for `.schema.json` takes precedence over the JSON plugin, whatever
  order they were added in. Before, the first plugin with a matching
  extension won.
- A plugin's `fragmentPointer` turns a fragment into a JSON Pointer, so a
  media type defines what its fragments identify, like anchors. Each
  document records the media type of the plugin that parsed it, so `get`
  knows which plugin to ask. A media type that doesn't define fragments
  identifies the whole document. This replaced the `anchors` and
  `fragmentKind` document properties, which only one media type used.
- `parse` gets the session the document is being retrieved in (see
  [Sessions](sessions.md#extending)).
