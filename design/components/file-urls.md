# Local paths in errors (`src/file-urls.js`)

An error's message is copied into logs, issues, and what tools report, and
a `file:` URL in it says where the files are on the machine. So
`relativeFileUrl` says a `file:` URL relative to the working directory
(`contextUrl`, which relative URLs are resolved against too):
`data/a.json#/a`, or `../other/a.json` outside it. Other URLs are said as
they are.

- A `JsonPointerError` says the location of the node it failed at, made
  relative this way. The location is already on the node, so
  `jsonPointerGet` and `jsonStep` aren't given the document's URL.
- `relativeFileUrl` is exported, so applications say URLs the same way in
  their own messages. It takes an `href`: a document's URL or a node's
  location (see
  [Identifiers are URLs](../principles/identifiers-are-urls.md)). A `file:`
  URL on another host is returned as it is.
- Where the working directory isn't a folder, as in a browser, there are no
  `file:` URLs, and one is said by its file name.

Rejected:

- Leaving it to whatever reports the error. Every application that shows
  an error would have to rewrite its text, and it can't tell which part of
  a message is a URL.
- Giving `relativeFileUrl` the base (`relativeFileUrl(url, base)`), such as
  a session's context URL. Messages are made in many places that don't
  have a session, so every one would need a base passed to it. A message
  is for whoever reads it, and relative to the working directory is what a
  relative path means to them.

## Known limitations

- A network error's message says the URL as it is, so a missing file's
  says its absolute path (see [Network errors](network-errors.md)).
- A stack trace still says where the library is installed. Showing it is
  up to the application.
