# The `file:` scheme (`src/transports/file-scheme.js`)

`file:` URLs are fetched on a server the way a browser fetches them, with
`nodeTransport()`.

- A missing file, a directory, or a method other than `GET` or `HEAD` is a
  network error, as in a browser (see
  [Like a web browser](../principles/like-a-web-browser.md)), with the
  filesystem's error as its cause (see [Errors](errors.md)).
- The file is opened before it's answered, so one that can't be read is a
  network error, not a body that fails partway. Size and modified time are
  from the open file.
- What isn't a file, like a directory, a FIFO, or a device, is
  `ERR_NOT_A_FILE`, found from the open file. It's opened with
  `O_NONBLOCK`, which a file ignores, because opening a FIFO otherwise
  waits for a writer forever.
  - Checking the path before opening it was rejected. It can change between
    the check and the open.
- A response is a 200 with `Content-Length` and `Last-Modified`, and no
  `Content-Type`, because a file has no media type. Whoever reads it says
  what it is.
- The body is streamed and closed when the signal aborts, erroring with the
  signal's reason, as `fetch` does.
- The query and fragment aren't part of the path.
- `root` limits what can be read to a directory, for every session on the
  stack. A path outside it is a network error. A `root` that can't be read
  is one too, naming `root`, so it isn't taken for a missing file. A
  session's `allowRetrieval` applies on top (see
  [What a session can fetch](allow-retrieval.md)).
- Only a `file:` document can refer to a `file:` URL, which the session
  checks (see [`file:` from `file:`](file-references.md)).
- Symlinks are followed before `root` is checked, so a link out of `root`
  is refused. The path as written is checked first too, so the error
  doesn't tell whether a file outside `root` exists.
- The response's URL is the file's real path, with the query asked for, so
  a file reached through a symlink resolves references against its own
  directory.

Rejected:

- The requested URL as the response's URL for a symlink. References would
  resolve against the link's directory, and one file would be two
  documents.
- A `Content-Type` from a table of extensions. The transport would decide
  what files are, and a table can't know an application's types.
- `file:` in `defaultTransport()`. It needs Node.js.

## Known limitations

- The real path is found, then the file is opened, so someone who can
  change links in `root` meanwhile can get outside it.
- A file that changes during a read is read partly old and partly new.
