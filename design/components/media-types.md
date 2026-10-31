# Media types (`src/hyperjump/media-types/`)

A media type plugin parses a response into a document, and says what its
fragments identify. JSON and JRef are built in.

- A response is parsed by the plugin with the most specific match for its
  `Content-Type`. If there's a tie, the plugin that comes first wins (see
  [Configuring plugins](sessions.md#configuring-plugins)).
- `content-type` v3 doesn't throw for a malformed header, so the type is
  validated, to keep rejecting an invalid `Content-Type`.
- The `Accept` header lists every plugin with its quality, `q=0` included,
  and `*/*` last. The `Hyperjump` gives it to the URI scheme plugin
  (`options.accept`). A plugin's quality is the plugin's (`quality`), and
  the JRef and JSON plugins take it as a constructor option. Changing a
  default's quality is configuring a replacement. Before 2026-10-30,
  `setMediaTypeQuality` changed a registered plugin's quality.
  - The header is built when the `Hyperjump` is created, so a plugin's
    quality can't change it later, and a `Hyperjump`'s configuration stays
    what it was created with. A quality has to be a number from 0 to 1 with
    at most three decimal places, RFC 9110's `qvalue`, or the `Hyperjump`
    throws when it's created.
  - The JRef and JSON plugins don't check their `quality` option
    themselves. The `Hyperjump` checks every plugin's, including ones an
    application writes.
- A response without a `Content-Type` can't be parsed. A plugin for a
  scheme without media types, like `file:`, gives a response the media type
  of its URL's extension with `options.mediaTypeByExtension`. The
  `http(s):` plugin doesn't, because a URL's extension doesn't say what's
  at it.
  - From 2026-10-30 to 2026-10-31, the `Hyperjump` gave every response
    without a `Content-Type` its extension's media type after the plugin
    returned it, and the `http(s):` plugin threw for a response without one
    to keep it from being guessed. The plugin threw before `Session` checked
    the response's URL against `allowRetrieval`, so a redirect to a refused
    URL was reported as a `RetrievalError` instead of a
    `RetrievalNotAllowedError`. Guessing also meant replacing a response
    from `fetch`, whose headers can't be changed, with a new `Response`,
    which throws for some statuses and loses `redirected`.
  - A flag on the plugin to turn guessing off was considered. Guessing on
    by default would let a plugin that maps to an `http(s):` URL with
    `options.retrieve`, like `urn:`, guess from that URL. Making the plugin
    decide removes the guessing from the `Hyperjump` instead.
  - Only a plugin knows whether its scheme has media types, so a plugin
    could also use the extension for a server it knows sends the wrong
    `Content-Type`. That isn't an option of the `http(s):` plugin yet.
- A response that no plugin can parse, for a missing, invalid or
  unsupported `Content-Type`, has its body cancelled, so its file or
  connection is released. The `file:` plugin opens a file before its media
  type is known, because the media type is the `Hyperjump`'s to decide.
- A response without a URL gets the URI that was retrieved, so a response
  from `options.retrieve` is checked against the URL it came from.
- URI scheme plugins don't get the `Hyperjump`. Before 2026-10-30, they
  were constructed with it, and the `http(s):` plugin only used it for the
  `Accept` header and the `file:` plugin for a file's media type, which
  made the client and its plugins depend on each other. What they needed
  are values `retrieve` gives them: `options.accept` and
  `options.mediaTypeByExtension`. A plugin for a scheme that maps to another URI, like `urn:`, is
  given `options.retrieve` (see [Sessions](sessions.md#configuring-plugins)).
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
