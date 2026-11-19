# Media types (`src/media-types/`)

A media type plugin parses a response into a document. JSON and JRef are
built in.

- A plugin is a plain object: `mediaType`, `extensions`, an optional
  `quality`, and `parse`. The built-in ones are values, so one with
  another quality is `{ ...jsonMediaType, quality: 0.5 }`.
- The plugins are a list, `defaultMediaTypes` by default. What a list means
  is three pure functions of it, tested without fetching:
  - `acceptHeader` lists every plugin with its quality, then `*/*`. A
    quality that isn't RFC 9110's `qvalue` throws.
  - `mediaTypeForContentType` is the most specific match: the media type,
    then a structured suffix (`application/json` for
    `application/problem+json`), then a range. The first plugin wins a tie.
  - `mediaTypeForExtension` is the longest extension a URL's path ends
    with, so `.schema.json` wins over `.json` in any order. It's for files,
    which have no media type (see [The `file:` scheme](file-scheme.md)).
    Case doesn't matter, as it doesn't to Apache or nginx.
    - Matching case was rejected. On a file system that ignores case,
      nothing else does.
- A `Content-Type` is what's before the first `;`, lowercased and checked
  against `token "/" token`. A parameter can't change which plugin parses,
  so parameters aren't parsed. A header with several values is read by the
  Fetch standard's "extract a MIME type", as a browser reads it.
- `parse` gets the response and the session. The session is for a media
  type that needs other documents to parse one. It gets them with
  `browse(session, url, { initiator: response, reference: "manual" })`, so
  a trace shows them under the document and the `file:` rule applies (see
  [`file:` from `file:`](file-references.md)).
- The JSON and JRef plugins read only `text` and `url` (`ParseSource`), so
  a plugin that has the text already doesn't make a `Response`.
- A plugin checks the URLs it reads. A URL it gives `browse` that isn't one
  is the plugin's bug, so `browse` throws `new URL`'s `TypeError`.
  - Giving it a code was rejected. A plugin's bug would look like a
    problem with the document.
- The JSON and JRef plugins make a document only for a `success` parse.
  Anything else is a `SyntaxError` with the code `ERR_SYNTAX`, whose cause
  is the syntax error (see [Errors](errors.md)).
- `parse` gives a document its `embedded` documents and its `anchors` (see
  [Documents](documents.md)).
- Nothing in the stack knows media types. `browse` chooses the plugin and
  sets `Accept`.

Rejected:

- `parse` without the session. Whatever wraps `browse` would keep its own
  documents next to the session's.
- Plugins made for each session. The session is made from the
  configuration that has the plugins.
- Classes or factory functions. A plugin holds no state, and its only
  option is spread into the value.
- The `content-type` package. Only the media type is read, which is a few
  lines.
- Matching only a plugin's own media type. A suffix is how the JSON plugin
  parses every media type that's JSON.
- A later plugin replacing an earlier one for the same media type. The
  list would be a configuration language. An application writes it out.
- A `VFileMessage` for a syntax error. It would be a dependency for what
  the cause already has.

## Known limitations

- A plugin that reads parameters gets the whole `Content-Type`, not the
  value it was chosen for.
- A plugin that gets the document it's parsing waits for itself.
- What a plugin gets has the priority it asks for, not the document's.
