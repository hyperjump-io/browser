# The `file:` scheme (`src/transports/file-scheme.js`)

`file:` URLs are fetched on a server, the way a browser fetches them, with
`nodeTransport()`.

- A missing file, a directory, or a method other than `GET` or `HEAD` is a
  network error, as in a browser, not a 404 (see
  [Like a web browser](../principles/like-a-web-browser.md)).
- A response is a 200 with the file's `Content-Length`, `Last-Modified`,
  and, if its extension has one, `Content-Type`
  (`contentTypeByExtension`). A file doesn't have a media type, so its
  extension is all there is. `contentTypes` adds or replaces extensions.
- The body is streamed, and the stream is closed when the request's signal
  aborts.
- The query and fragment aren't part of the path.
- `root` limits what can be read to a directory. A path outside it is a
  network error. It's the transport's, so it's for every session on the
  stack, before a session's `allowRetrieval`, which allows only the working
  directory by default (see [What a session can fetch](allow-retrieval.md)).
- Only a `file:` document can refer to a `file:` URL. It's the session's
  rule, not the transport's, so it's checked before anything in the stack
  answers (see [`file:` from `file:`](file-references.md)).
- Symlinks are followed before `root` is checked, so a symlink inside `root`
  that points outside it is a network error. The path as it's written is
  checked first too, so whether a file outside `root` exists can't be told
  from the error.
- The response's URL is the file's real path, with the query of the URL
  that was asked for. A file reached through a symlink is where it is, so
  references in it resolve against its own directory.

Rejected:

- The URL that was asked for as the response's URL, for a symlink. A
  document's relative references would resolve against the link's
  directory, and two URLs for one file would be two documents.
- A 404 for a missing file. That's a server's answer, and a browser gives a
  network error.
- `file:` in `defaultTransport()`. It needs Node.js, and a stack for a
  browser would have to leave it out.

## Known limitations

- The real path is found, then the file is opened, so a symlink that's
  changed between the two can still lead outside `root`. Someone who can
  change links in `root` while it's read can get around it.
- A file that changes during a read is read as it is, partly old and partly
  new.
