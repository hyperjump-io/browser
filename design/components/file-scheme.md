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
  network error. A document can name any file, so an application that
  fetches what documents refer to sets it.
- The response's URL is the URL that was asked for.

Rejected:

- A 404 for a missing file. That's a server's answer, and a browser gives a
  network error.
- `file:` in `defaultTransport()`. It needs Node.js, and a stack for a
  browser would have to leave it out.

## Known limitations

- `root` is checked against the path as it's written, and reading the file
  follows symlinks. A symlink inside `root` that points outside it can be
  read.
- A file that changes during a read is read as it is, partly old and partly
  new.
