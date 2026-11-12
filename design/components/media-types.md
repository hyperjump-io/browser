# Media types (`src/media-types/`)

A media type plugin parses a response into a document, and says what its
fragments identify. JSON and JRef are built in.

- A plugin is a plain object: its `mediaType`, the `extensions` its files
  have, an optional `quality`, `parse`, and an optional `fragmentPointer`.
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
- `parse` takes only a response's `text` and `url`, which is all the JSON
  and JRef plugins read. A plugin that's read the text already gives them
  the text as it is, without making a new `Response` and defining its
  `url`, which its constructor can't set.
- The JSON and JRef plugins only make a document for a parse whose status
  is `success`. Anything else rejects with a `SyntaxError` whose message
  says the first error and where it is. Its `cause` is the error, which is
  plain data (see [The JSON AST](json-ast.md)), with the code `ERR_SYNTAX`,
  and its `url` is the document's (see
  [Errors with codes](coded-errors.md)).
- `parse` gives a document the documents it contains, as `embedded` (see
  [Documents](documents.md)). An embedded document is in its container's
  media type.
- A plugin's `fragmentPointer` turns a fragment into a JSON Pointer, so a
  media type defines what its fragments identify. JRef's are JSON
  Pointers. A media type without it, like JSON, identifies the whole
  document.
- Nothing in the stack knows media types. They're for what reads a
  response, not for what fetches it: `getDocument` chooses the plugin and
  sets `Accept` (see [Documents](documents.md)).

Rejected:

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
