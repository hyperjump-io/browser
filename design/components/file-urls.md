# Local paths in errors (`src/file-urls.js`)

An error's message is copied into logs and issues, and a `file:` URL in it
says where files are on the machine. So `relativeFileUrl` says a `file:`
URL relative to the working directory, like `data/a.json#/a` or
`../other/a.json`, and the error keeps the exact URL as its `url` (see
[Errors](errors.md)). It's exported, so applications say URLs the same
way. A `file:` URL on another host is said as it is, and where the working
directory isn't a folder, as in a browser, a `file:` URL is said by its
file name.

Rejected:

- Leaving it to whatever reports the error. Every application would
  rewrite messages, and it can't tell which part of one is a URL.
- Passing the base, like a session's context URL. Messages are made in
  many places that don't have a session, and relative to the working
  directory is what a relative path means to whoever reads it.

## Known limitations

- A network error's cause is the system's error, whose message says the
  absolute path.
- A stack trace says where the library is installed.
