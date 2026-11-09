# What can be retrieved (`allowRetrieval`, `src/hyperjump/allowed-urls.js`)

Documents aren't trusted. A document shouldn't be able to make an
application retrieve whatever it names, such as an internal address over
HTTP or a file outside the project through a `file:` reference. So only what
the application allows is retrieved, and the default allows only what's
local to it.

- The `allowRetrieval` config is a list of URLs, `string[]`. One that ends
  with `/` allows everything under it. Any other allows only itself. They're
  compared after the URL is parsed, so dot segments and the host can't get
  around it. An entry's fragment is ignored.
  - An origin without a `/`, like `https://example.com`, allows everything
    on it. It parses to the origin's root, `https://example.com/`, which
    ends with `/`. Making it allow only the root would go against how it
    parses, and no one means only the root. Throwing for it, to make the
    `/` explicit, was considered and rejected, because it would refuse a
    spelling of the same URL. Both are the same for `headers` keys (see
    [Request headers](request-headers.md)).
- A relative entry is resolved against the context URL, like a relative
  path is. That's the working directory in Node.js and the page in a
  browser (`#context-url`). Each session resolves its entries, or the
  config's (`hyperjump.config`), or the default, against its own context
  URL (see [Sessions](sessions.md)). Resolving the config's once, when the
  `Hyperjump` is created, and giving them to sessions through a `WeakMap`
  was rejected. A session's context URL can differ from the one the
  `Hyperjump` was created with, and the `WeakMap` is one more thing to keep
  in sync. `allowed-urls.js` is given the context URL rather
  than reading it, so its tests give it a page or nothing instead of
  mocking modules. Without a page, it's `undefined`.
  - Entries are resolved when the config or the session's options are
    given, so one that isn't a URL throws a `TypeError` there. A relative
    entry where there's no context URL, such as in a worker, throws a
    `TypeError` and says to use an absolute URL, instead of quietly
    allowing nothing. The default is resolved when a session first checks
    a URL, so an application without a context URL that never retrieves
    anything doesn't need the config.
- Entries and the URLs checked against them are compared as parsed URLs,
  so they have the same case, dot segments, and ports (see
  [Identifiers are URLs](../principles/identifiers-are-urls.md)).
- The default is `["./"]` everywhere: the working directory in Node.js, and
  the page's directory in a browser. Browsers can't read `file:` URLs
  anyway.
  - It's a hypermedia client, and following links across origins is what
    it's for, so an application that browses a remote API lists its
    origins. Allowing everything by default, with applications that need it
    passing their own default, was considered, but the threat is the same,
    and users would only be safe if they opted in.
  - It's data, so an application extends it by writing it out, such as
    `["./", "https://api.example.com/"]`, and `[]` allows nothing. It's the
    same in Node.js and in browsers.
  - A predicate, `(url: URL) => boolean | Promise<boolean>`, with a default
    for each runtime, was rejected. Allowing a URL as well as the default
    would mean calling the default, so it would have to be exported. A
    predicate written without it would have to know to compare against
    `realpath(cwd())`, not `cwd()`, or a working directory reached through a
    symlink would refuse every file. A list has none of these problems.
  - In a browser, the default is the page's directory, not its whole
    origin. An application whose documents are elsewhere on its origin adds
    `"/"`. A default of `["/"]` in browsers was rejected because then the
    default would be different in Node.js, where `/` is the whole
    filesystem.
- Only prefixes and exact URLs, no globs. Prefixes cover origins,
  directories, and single URLs. Glob syntax would collide with URLs, where
  `?`, `*`, `[`, and `:` already mean something, so every entry would be a
  pattern and a literal one would need escaping, and a glob matched against
  the whole URL text lets `https://*.example.com/` match
  `https://evil.com/x.example.com/`. If wildcards are needed, such as any
  subdomain, entries could also be `URLPattern`s (`(string | URLPattern)[]`).
  It's the web standard, matches each part of a URL separately, and takes a
  base URL for relative patterns. Strings would stay literal. Check which
  Node.js versions have it unflagged first.
- A predicate as well as the list, for anything a list can't say, was
  considered and left out until someone needs it. Whoever used it would
  have the problem the list solves.
- It's config, because it's a property of the application, like its URL
  scheme plugins, and every session should follow it by default. A session
  can have its own (`SessionOptions.allowRetrieval`), which replaces the
  config's rather than adding to it, for an application that allows
  different things for different sessions. A session can allow less than
  the config, so it can't only add to it. One that allows more lists the
  config's entries too. The application creates its sessions, so it's still
  the application's decision.

## Where it's checked

- `Session` checks it when it retrieves a document that isn't in its
  cache, before it retrieves it with a URL scheme plugin, so it covers `get`,
  `getDocument`, and following references. A subclass that overrides
  `getDocument` to find documents elsewhere first isn't checked for those.
  It's before the URL scheme plugins, so it's before the HTTP cache too,
  and a cached response isn't a way around it.
- A redirect is checked before it's followed, because the session follows
  it (see [Redirects](redirects.md)). That includes a plugin for a scheme
  that maps to another URL, like `urn:`, which redirects to it.
- An error about a list, or a refused URL's, says which list to change:
  the config's, or the session's own option, which replaces the config's
  so adding to the config wouldn't help. The default is the config's,
  because configuring a list is how it's changed. Without a context URL,
  the default's error says to configure absolute URLs, not to use one, since
  the application didn't write `./`.
- A refused URL is a `RetrievalNotAllowedError`, thrown as it is, not
  wrapped in a `RetrievalError`. It's distinct from a `RetrievalError` for
  a URL that was allowed and couldn't be retrieved, so tools can tell a
  refused URL (unknown) from a failed one (missing).
- The URL a response came from is also checked, for a symlink or a
  redirect that `fetch` followed in a browser. A response from a refused
  URL is a `RetrievalNotAllowedError` whose `url` is that URL. Its body is
  cancelled. A redirect the session refuses before it's followed is the
  same error, and its `url` is where the redirect led.

## Symlinks

- A symlink inside an allowed directory can point outside it. In Node.js, a
  `file:` URL is replaced with its real path (`realpath`) before it's
  checked, and so are `file:` entries. The `file:` plugin reads the file
  from its real path and gives that real path as the response's URL, which
  is checked again (see [The `file:` scheme](file-scheme.md)). So what's
  checked is what's read, even if the path changes between the first check
  and the read. There's no cheaper way to tell whether a path goes through
  a symlink than `realpath`, so every `file:` retrieval costs two
  filesystem calls, the check's and the plugin's.
- A `file:` entry's real path is found the first time a session checks
  against it and kept for the session, which is a consistent snapshot
  anyway. An entry that doesn't exist is compared as it is.
- A file that doesn't exist has no real path, so its path is checked as it
  is. If it's allowed, retrieving it fails as missing instead of being
  refused.
- A `file:` URL with a host, and an entry with one, is compared as it is,
  without its real path. On Windows its path is a UNC path, and `realpath`
  would connect to the host, sending the user's credentials, before the
  URL is refused. A document can name any host, so the check can't touch
  it. A symlink on a share isn't followed by the check. Only the
  application can allow a host, so that's its choice. Checking the path as
  written before finding its real path was rejected: a symlink outside an
  allowed directory that points into it would be refused.

## Known limitations

- In a browser, `allowRetrieval` can't stop a request that a redirect
  leads to, because `fetch` follows it (see [Redirects](redirects.md)).
  Only its response isn't used, which is the protection CORS gives anyway.
- A URL is checked, not the address it connects to, so a host whose DNS
  points at an internal address is allowed if its URL is. A `fetch`
  dispatcher could check the address, which would also stop DNS rebinding,
  but it needs `undici`.
- Someone who can change the filesystem could swap a part of a path for a
  symlink between `realpath` and the read. The response's URL is checked,
  but it's the path the plugin resolved, not necessarily what it opened.
  The file is also opened before that second check, though nothing is read
  from it if it's refused. Opening a FIFO or a device can have an effect.
  Documents are what's untrusted, not the filesystem, so that's out of
  scope.
