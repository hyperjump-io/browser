# Local paths in errors (`src/hyperjump/file-uris.js`)

An error's message is copied into logs, issues, and what tools report, and
a `file:` URL in it says where the files are on the machine. So errors say
a `file:` URL with `relativeFileUri`, relative to the working directory
(`contextUri`, which relative URLs are resolved against too):
`data/a.json#/a`, or `../other/a.json` outside it. Other URLs are said as
they are.

- Each error keeps the exact URL on a property (`uri`), for code that needs
  to know what failed. `RetrievalError` takes the URL and makes its own
  message, so every one says it the same way.
- A missing file is a `FileNotFoundError`, the cause of the
  `RetrievalError`, instead of Node.js's error, whose message says the
  absolute path. Another error reading a file says its code, like
  `EACCES`, for the same reason.
- A `JsonPointerError` says the location of the node it failed at, made
  relative the same way. The location is already on the node, so
  `pointerGet` and `pointerStep` aren't given the document's URI.
- `relativeFileUri` is exported, so applications say URLs the same way in
  their own messages.
- A URL is normalized before it's made relative, so one written as
  `FILE:///…`, as a schema author might, is relative too.
- Where the working directory isn't a folder, as in a browser, there are no
  `file:` URLs, and one is said by its file name.

Rejected:

- Relative to the document that referenced it (`referencedFrom`). A message
  would read differently depending on which file it's about, and a
  document's errors are made once for every reference to it.
- Leaving it to whatever reports the error. Every application that shows
  an error would have to rewrite its text, and it can't tell which part of
  a message is a URL.
- Giving `relativeFileUri` the base (`relativeFileUri(uri, base)`), such as
  a session's context URI. Messages are made in many places that don't
  have a session, like `@hyperjump/json-schema`'s errors and output, so
  every one would need a base passed to it. A message is for whoever reads
  it, and relative to the working directory is what a relative path means
  to them.

Known limitations:

- A file that can be found but not read fails while it's being parsed, and
  that error comes from the stream, with the absolute path.
- A stack trace still says where the library is installed. Showing it is
  up to the application.
