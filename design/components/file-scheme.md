# The `file:` scheme (`src/hyperjump/uri-schemes/file-scheme-plugin.js`)

- A file is read from its real path, with every symlink in the path
  resolved, and the response's URL is that real path. Without a symlink,
  the response's URL is the URI that was asked for.
- A document read through a symlink is identified by its real path, so its
  relative references resolve from where the file really is, next to the
  files its author wrote it with. It's how Node.js resolves modules.
  Keeping the URL it was asked for was considered, but the author of a
  symlinked file didn't write it relative to the link. Before, only a
  symlink at the file itself was resolved, and the file was read through
  the path it was asked for, so what was read wasn't necessarily what the
  response's URL said.
- A file can't be retrieved from a reference in a document that isn't a
  file, so a document from the web can't read files.
- A file's media type comes from its extension, the longest one a media
  type plugin matches (see [Media types](media-types.md)).
- A missing file is a `FileNotFoundError` whose message is relative to the
  working directory, not Node.js's error (see [Local paths in
  errors](file-uris.md)).
- It isn't available in a browser.
