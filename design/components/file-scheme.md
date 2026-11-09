# The `file:` scheme (`src/hyperjump/url-schemes/file-scheme-plugin.js`)

- A file is read from its real path, with every symlink in the path
  resolved, and the response's URL is that real path. Without a symlink,
  the response's URL is the URL that was asked for.
- A document read through a symlink is identified by its real path, so its
  relative references resolve from where the file really is, next to the
  files its author wrote it with. It's how Node.js resolves modules.
  Keeping the URL it was asked for was considered, but the author of a
  symlinked file didn't write it relative to the link. Resolving only a
  symlink at the file itself, and reading through the path that was asked
  for, was rejected because what's read wouldn't necessarily be what the
  response's URL says.
- A file can't be retrieved from a reference in a document that isn't a
  file, so a document from the web can't read files. A document is a file
  when its scheme is `file`, compared case-insensitively.
- A file doesn't have a media type, so its response's `Content-Type` is
  the media type of its extension, the longest one a media type plugin
  matches (`options.mediaTypeByExtension`, see [Media types](media-types.md)).
  Without one, the response doesn't have a `Content-Type`.
- A missing file is a `FileNotFoundError` whose message is relative to the
  working directory, not Node.js's error (see [Local paths in
  errors](file-urls.md)).
- It isn't available in a browser.
