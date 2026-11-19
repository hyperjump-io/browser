# What a session can fetch (`src/allowed-urls.js`)

Documents aren't trusted, so a document shouldn't make an application fetch
whatever it names, like an internal address or a file outside the project.
A session fetches only what its `allowRetrieval` allows, and the default
allows only what's local to the application.

- `allowRetrieval` is a list of URLs, with the rule `headers` keys have
  (see [Request headers](request-headers.md)): one that ends with `/`
  allows what's under it, and any other only itself.
- Exact entries are a `Set`, and only prefixes are tried one at a time, so
  a long list of exact URLs costs nothing.
- Relative entries are resolved against the context URL when the session is
  created, and one that can't be throws a `TypeError` there.
  `allowed-urls.js` is given the context URL and the default, so its tests
  don't change the working directory.
- The default is what's local, which differs by runtime (`#context-url`):
  - In Node.js it's `["./"]`. `/` would be the whole filesystem.
  - In a browser it's `["/"]`, the page's origin, which is what a browser
    trusts as one site. A page's documents aren't always in its directory.
  - Where there's no context URL, like a worker, the error is kept and
    thrown when a URL is checked, so a session that never fetches doesn't
    need a list.
  - It's data, so an application extends it by writing it out, like
    `["./", "https://api.example.com/"]`.
- A `data:` URL is always allowed. Nothing is fetched, and it has no `/` to
  be a prefix of.

Rejected:

- One default for every runtime. `["./"]` refuses a page's documents
  elsewhere on its origin, and `["/"]` in Node.js is the whole filesystem.
- Allowing everything by default, with an opt-in. The threat is the same,
  and users would be safe only if they opted in.
- A predicate. Extending the default would mean calling it, and a predicate
  would have to know to compare a `file:` URL by its real path. A predicate
  beside the list has the problem the list solves.
- Globs. `?`, `*`, `[`, and `:` already mean something in URLs, and
  `https://*.example.com/` matched as text matches
  `https://evil.test/x.example.com/`. `URLPattern` entries could come later.
- A layer. The stack is shared, a layer above would answer first, and the
  HTTP cache would have to be below it.
- A second place for layers, before the check, for documents an
  application has. A layer that answers URLs is listed in `allowRetrieval`.
  The `registry` isn't a layer (see [The registry](registry.md)).

## Where it's checked

The session checks before the stack does anything:

- The URL that's asked for, before its headers are found. A refused one is
  still recorded, like a request a browser blocks.
- Where a redirect leads, before it's followed (see
  [Redirects](redirects.md)).
- A response's URL that isn't the one asked for, like the real path of a
  symlink or where a browser's redirect led. Its body is cancelled.

The [`file:` from `file:`](file-references.md) rule is checked at each of
these too.

Only the session checks. Code that calls the stack directly is trusted, and
a document can't call code. A layer that fetches for a document goes
through the session. A layer's own work, like revalidating, is for a URL
that was allowed.

What a layer answers without fetching, like the HTTP cache, has to be
allowed too, so a cache isn't a way around the list. The session can't
know which layer will answer. The registry is asked before the check,
because what it has isn't fetched.

A refusal is a network error whose message says to add the URL to
`allowRetrieval` (see [Errors](errors.md)).

## Symlinks

- In Node.js, `file:` URLs and `file:` entries are compared by real path
  (`realpath`, `#real-url`). A working directory reached through a symlink
  allows its own files, and a symlink out of it is refused before the file
  is opened.
- An entry's real path is found at the first check and kept for the
  session.
- A path with no real path, like a missing file or a symlink loop, is
  checked as the real path of its closest directory that has one, plus the
  rest as written. What doesn't exist has no symlinks, so it's checked
  where it would be, and a missing file fails as missing, not refused. A
  URL that isn't a path, like one with `%2F` on POSIX, is checked as
  written. An entry is treated the same, so a bad one doesn't break the
  others.
  - Checking it as written was rejected. A missing file under an entry
    reached through a symlink, like `/tmp` on macOS, would be refused.
- A `file:` URL or entry with a host is compared as it is. On Windows,
  `realpath` would connect to the host with the user's credentials before
  the URL is refused.
- The `file:` scheme's `root` is the transport's limit, for every session
  (see [The `file:` scheme](file-scheme.md)). Each fetch finds the real
  path twice.

## Known limitations

- The URL is checked, not the address it connects to, so DNS that points at
  an internal address gets through. A `fetch` dispatcher could check it,
  but it needs `undici`.
- In a browser, the browser follows redirects itself, so only the response
  is refused, which is what CORS protects anyway.
- Someone who can change the filesystem can swap in a symlink between the
  `realpath` and the open. Documents are what's untrusted, not the
  filesystem.
