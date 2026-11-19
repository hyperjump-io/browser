# The file cache store (`src/http-cache/file-cache-store.js`)

A `CacheStore` on disk, so the HTTP cache outlives the process. It's for
Node.js, and its browser version throws (see [Packaging](packaging.md)).

- A URL is one file with all its `Vary` variants: a version header, the
  variants as JSON, and their bodies as bytes, so binary responses are kept
  as they are.
- A file is named by a SHA-256 of its URL, in one of 256 directories by the
  first two characters, so a URL is never a path and no directory gets too
  big.
- Files are `0o600` and the directories it makes are `0o700`, because a
  response can be private and a cache directory can be readable by others.
  A directory it's given keeps its mode.
- It only touches what has its names, so a directory it's given can have
  other things in it, and `clear` removes a directory only if it's empty.
- A file is written under a temporary name and renamed, so any reader sees
  the old file or the new one. A temporary file is removed when the
  directory is read only if it's an hour old, since a newer one can be a
  put in flight.
- In a process, operations on a file run one at a time, so concurrent puts
  keep each other's variants. Between processes, the last write wins.
- With `maxSize`, least recently used URLs are removed after a write. The
  order is kept in memory, read from file times when first needed, and a
  match sets the file's time, so it outlives the process.
- A file that's damaged, from another format version, or for another URL is
  a miss and is removed.

Rejected:

- Taking over the whole directory. A shared one would lose others' files.
- A file for each variant. Replacing a variant across files can't be
  atomic.
- JSON for the whole file. Binary bodies would change or grow a third.
- An index file of sizes and times. Every process would write it with every
  put.

## Known limitations

- With more than one process writing, `maxSize` is only about right.
