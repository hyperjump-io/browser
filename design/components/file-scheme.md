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
  file, so a document from the web can't read files. It's the `file:` from
  `file:` layer of each session's stack (`file-from-file.js`, see
  [Layers](layers.md)), not the plugin's, so an application's own `file:`
  plugin gets it too. It answers a 403 for a `file:` URL whose `Referer`,
  the URL of the document with the reference, isn't a `file:` URL. A
  request without a `Referer`, like a URL an application passes to `get`,
  is allowed.
- A file doesn't have a media type, so its response doesn't have a
  `Content-Type`. The media type by extension layer gives a `file:`
  response the media type of its extension, the longest one a media type
  plugin matches (see [Media types](media-types.md)).
- A missing file is a `FileNotFoundError` whose message is relative to the
  working directory, not Node.js's error (see [Local paths in
  errors](file-urls.md)).
- It isn't available in a browser.
