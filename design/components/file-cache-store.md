# The file cache store (`src/http-cache/file-cache-store.js`)

A `CacheStore` on disk, so the HTTP cache outlives the process. It's for
Node.js, and its browser version throws (see [Packaging](packaging.md)).

- A URL is one file, with all its `Vary` variants: a header with the
  format's version, the variants as JSON, and their bodies one after
  another. Bodies are bytes, so binary responses are kept as they are.
- A file is named by a SHA-256 hash of its URL, in one of 256 directories by
  the hash's first two characters, so a URL is never a path and no
  directory gets too big.
- A file is written under a temporary name and renamed, so a reader, even in
  another process, sees the old file or the new one, never part of one. A
  temporary file left by a crash is removed the next time the directory is
  read.
- In a process, operations on the same file run one at a time, so puts at
  the same time don't lose each other's variants. Between processes, the
  last write wins.
- With `maxSize`, the least recently used URLs are removed after a write
  until the cache is under it. When each URL was last used is kept in
  memory, read from the files' times the first time it's needed, and a
  match sets the file's time too, so the order outlives the process.
- A file that's damaged, from another version of the format, or for another
  URL is a miss, and it's removed.

Rejected:

- A file for each variant. A put would have to find and replace the
  variant it's for across files, which can't be done atomically.
- JSON for the whole file, with the body as text or base64. Binary bodies
  would be changed or made a third bigger.
- An index file of sizes and times. It would have to be written with every
  put, by every process, without losing the others' writes.

## Known limitations

- With more than one process writing, each knows only the sizes it has seen,
  so `maxSize` is only about right.
