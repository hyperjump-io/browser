# Media types (`src/hyperjump/media-types/`)

A media type plugin parses a response into a document, and says what its
fragments identify. JSON and JRef are built in.

- A response is parsed by the plugin with the most specific match for its
  `Content-Type`. If there's a tie, the plugin that comes first wins (see
  [Configuring plugins](sessions.md#configuring-plugins)).
- `content-type` v3 doesn't throw for a malformed header, so the type is
  validated, to keep rejecting an invalid `Content-Type`.
- The `Accept` header lists every plugin with its quality, `q=0` included,
  and `*/*` last. It's the `Hyperjump`'s `accept`, and the `Accept` layer
  of a session's stack (`accept.js`, see [Layers](layers.md)) sets it on
  every request, replacing one the request has, because the media type
  plugins depend on it. A plugin's quality is the plugin's (`quality`), and
  the JRef and JSON plugins take it as a constructor option. Changing a
  default's quality is configuring a replacement. A `setMediaTypeQuality`
  for a registered plugin was rejected with the other ways to change
  plugins after a `Hyperjump` is created (see
  [Configuring plugins](sessions.md#configuring-plugins)).
  - The header is built when the `Hyperjump` is created, so a plugin's
    quality can't change it later, and a `Hyperjump`'s configuration stays
    what it was created with. A quality has to be a number from 0 to 1 with
    at most three decimal places, RFC 9110's `qvalue`, or the `Hyperjump`
    throws when it's created.
  - The JRef and JSON plugins don't check their `quality` option
    themselves. The `Hyperjump` checks every plugin's, including ones an
    application writes.
- The JRef and JSON plugins' `parse` takes only the response's `text` and
  `url`, which is all they read. A plugin that's read the text already,
  like `@hyperjump/json-schema`'s for JSON that might be a schema, gives
  them the text as it is, without making a new `Response` and defining its
  `url`, which its constructor can't set.
- A response without a `Content-Type` can't be parsed. The media type by
  extension layer of a session's stack (`media-type-by-extension.js`, see
  [Layers](layers.md)) gives a response the media type of its URL's
  extension when it's a `file:` response, because a file doesn't have a
  media type, or when its URL is one of the `mediaTypeByExtension`
  config's. Any other response keeps what it has, because a URL's extension
  doesn't say what a server sends.
  - Giving every response without a `Content-Type` its extension's media
    type was rejected. A server that sends none would have its type
    guessed, and a plugin for a scheme that maps to an `http(s):` URL, like
    `urn:`, would guess from that URL.
  - URL scheme plugins setting it, with an `options.mediaTypeByExtension`
    from the session, was rejected because a plugin is a `Fetch`, which
    takes only a request. A plugin's own option for it, like the
    `http(s):` plugin's, couldn't know the media type plugins either.
  - `file:` is always given its extension's media type, rather than being a
    default entry in the config, so a config that lists other URLs doesn't
    have to list it, and an application's own `file:` plugin gets it too.
    An application's plugin for another scheme without media types lists
    its URLs in the config.
- The `mediaTypeByExtension` config lists URLs whose responses get their
  media type from their extension. It's for servers that send the wrong
  `Content-Type`. GitHub sends `text/plain` for every raw file. Replacing a
  type the server sent isn't standard, so it's only done for the URLs the
  user lists. RFC 9110 §8.3 only lets a client work out a missing type.
  - The extension replaces a wrong type as well as a missing one. Filling
    in only a missing type was rejected because GitHub's type isn't
    missing. When no media type plugin defines the extension, the
    response's type is kept because it's still the best there is.
  - It's `Hyperjump` config, not an option of the `http(s):` plugin,
    because the layer needs the media type plugins. Its URLs can have any
    scheme, and have to be absolute, because there's no context URL when a
    `Hyperjump` is created.
  - The list works like `allowRetrieval`. A record by URL like `headers`
    was rejected because there's nothing to give each URL. Its URLs are
    checked and matched the way `headers` URLs are (`url-entries.js`). See
    [Request headers](request-headers.md).
  - A response is matched by the URL it came from after any redirects
    because that's the server that sent the wrong type. `headers` is
    matched by the URL that's requested because headers are part of the
    request.
  - The extension is the end of the URL's path, without the query, such as
    the `?token=` on a private GitHub raw URL, which would hide it.
  - Only a success (200 or 203) gets it, so an error keeps its type, like a
    refusal's Problem Details.
  - The layer is above the HTTP cache, so the cache keeps the
    `Content-Type` the server sent, and changing the config doesn't need
    the cache cleared. A response from `fetch` can't have its headers
    changed, so it's replaced with a new `Response`. The new response
    doesn't keep `redirected`, but nothing reads it.
- A response that no plugin can parse, for a missing, invalid or
  unsupported `Content-Type`, has its body cancelled, so its file or
  connection is released. The `file:` plugin opens a file before its media
  type is known, because the media type plugins decide it, not the URL
  scheme plugin.
- A response without a URL gets the URL that was retrieved, so a
  redirect's relative `Location` has something to be resolved against.
- URL scheme plugins don't get the `Hyperjump`. Constructing them with it
  was rejected. The `http(s):` plugin would only use it for the `Accept`
  header and the `file:` plugin for a file's media type, and the client and
  its plugins would depend on each other. The layers above them give the
  request its `Accept` and the response its extension's media type. A
  plugin for a scheme that maps to another URL, like `urn:`, returns a
  redirect (see [Redirects](redirects.md)).
- A file's media type is the plugin with the longest matching extension, so
  a plugin for `.schema.json` takes precedence over the JSON plugin, whatever
  order they were added in. Letting the first plugin with a matching
  extension win was rejected because a plugin for `.schema.json` would
  lose to the JSON plugin, which is a default and comes first.
- A plugin's `fragmentPointer` turns a fragment into a JSON Pointer, so a
  media type defines what its fragments identify, like anchors. Each
  document records the media type of the plugin that parsed it, so `get`
  knows which plugin to ask. A plugin can set another one on the document
  it returns, for a document it found to be in a more specific media type,
  like JSON that's a JSON Schema, so that media type's plugin reads its
  fragments. A media type that doesn't define fragments
  identifies the whole document. `anchors` and `fragmentKind` properties
  on documents were rejected because only one media type would use them
  (see [A generic client](../principles/generic-client.md)).
- `parse` gets the session the document is being retrieved in (see
  [Sessions](sessions.md#extending)).
