# Media types (`src/media-types/`)

A media type plugin parses a response into a document, which says what
its fragments identify. JSON and JRef are built in.

- A plugin is a plain object: its `mediaType`, the `extensions` its files
  have, an optional `quality`, and `parse`.
  The built-in ones are values (`jsonMediaType`, `jrefMediaType`), so one
  with another quality is `{ ...jsonMediaType, quality: 0.5 }`.
- The plugins an application uses are a list, and `defaultMediaTypes` is
  JRef, then JSON. What a list means is three pure functions of it, so
  they're tested without fetching anything:
  - `acceptHeader` lists every plugin with its quality, `q=0` included, in
    order, and `*/*` last. A quality has to be a number from 0 to 1 with at
    most three decimal places, RFC 9110's `qvalue`, or it throws.
  - `mediaTypeForContentType` is the plugin with the most specific match
    for a `Content-Type`: its own media type, then a structured suffix
    (`application/json` for `application/problem+json`), then a range
    (`application/*`). The first plugin wins a tie. A `Content-Type`
    that's missing or isn't a media type has none.
  - `mediaTypeForExtension` is the plugin with the longest extension a
    URL's path ends with, so a plugin for `.schema.json` wins over the JSON
    plugin, whatever order they're in. A file doesn't have a media type,
    so its extension is all there is (see
    [The `file:` scheme](file-scheme.md)).
- A `Content-Type` is read without a parser of its own: what's before the
  first `;`, in lowercase, checked against RFC 9110's `token "/" token`. A
  parameter can't change which plugin parses a response, so parameters
  aren't parsed.
- `parse` gets the response and the session. The response's `url` is the
  document's, without a fragment, and its `headers` have its
  `Content-Type`'s parameters, which a media type can give a meaning.
  - The session is for a media type that needs other documents to parse
    one, like a document that names what defines it. It gets them with
    `browse(session, url, { initiator: response, reference: "manual" })`, so a trace shows
    them under the document, and a document from the web can't make its
    plugin read a file (see [`file:` from `file:`](file-references.md)).
  - The JSON and JRef plugins take only a response's `text` and `url`
    (`ParseSource`), which is all they read. A plugin that's read the text
    already gives them the text as it is, without making a new `Response`.
- A URL a plugin puts in a document, a reference's `href` or an
  `embedded` document's, is a URL, because a plugin checks what it reads
  from the document. The JRef plugin makes a `$ref` that doesn't resolve
  an `invalid-reference`. A plugin that gives `browse` one that isn't a
  URL has a bug, and `browse` throws the `TypeError` that `new URL` does.
  - Giving it a code, like a document that can't be used, was rejected.
    It would make a plugin's bug look like a problem with the document.
- The JSON and JRef plugins only make a document for a parse whose status
  is `success`. Anything else rejects with a `SyntaxError` whose message
  says the first error and where it is. Its `cause` is the error, which is
  plain data (see [The JSON AST](json-ast.md)), with the code `ERR_SYNTAX`,
  and its `url` is the document's (see
  [Errors with codes](coded-errors.md)).
- `parse` gives a document the documents it contains, as `embedded` (see
  [Documents](documents.md)). An embedded document is in its container's
  media type.
- `parse` gives a document its `anchors`, which say what its fragments
  identify, so a media type defines that in the documents it makes (see
  [Documents](documents.md)). JRef's fragments are JSON Pointers, so its
  documents have `anchors` with none in it. JSON's have no `anchors`, so
  a fragment identifies the whole document.
  - A `fragmentPointer` function of the plugin's was rejected (see
    [Documents](documents.md)).
- Nothing in the stack knows media types. They're for what reads a
  response, not for what fetches it: `browse` chooses the plugin and
  sets `Accept` (see [Documents](documents.md)).

Rejected:

- `parse` without the session, with what else a document needs worked out
  from the document `browse` returns. It moves the session to
  whatever wraps `browse`, which then keeps its own documents next to
  the session's, and the response's headers have to be carried on the
  document to get there.
- Plugins made for each session, which close over it. A session is made
  from the configuration that has the plugins, so the session would be
  given to them after it's made.
- Classes, like `new JsonMediaTypePlugin({ quality })`. A plugin holds no
  state, so a class would only hold its options.
- Factory functions, like `jsonMediaType({ quality })`. The only option is
  the quality, and spreading the value says the same.
- The `content-type` package for parsing the header. Only the media type
  is read, which is a few lines, and it would be a dependency for them.
- Matching only a plugin's own media type. A response in
  `application/problem+json` is JSON, and a plugin for a suffix is how the
  JSON plugin parses every media type that's JSON.
- A later plugin replacing an earlier one for the same media type, with
  the defaults always first. The list would be a configuration language of
  its own. An application that changes a default writes the list out.
- A `VFileMessage` for a document with a syntax error. It would be a
  dependency for a class, and its `source`, `ruleId`, and `place` are what
  the cause already has.

## Known limitations

- A plugin that gets the document it's parsing, like one that defines
  itself, waits for itself. The plugin has to see that it's the same URL.
- What a plugin gets has the priority it asks for, not the priority of the
  document it's parsing.
