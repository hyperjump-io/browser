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
- A relative entry is resolved against the context URI, like a relative
  path is. That's the working directory in Node.js and the page in a
  browser (`#context-uri`). The config's entries are resolved when the
  `Hyperjump` is created, a session's when it is, and the default against
  the session's context URI (see [Sessions](sessions.md)). `allowed-urls.js`
  is given the context URI rather than reading it, so its tests give it a
  page or nothing instead of mocking modules. Without a page, it's `""`, which counts as
  none. Entries are resolved when the config or the session's options are
  given, and one that isn't a URL throws there. A relative entry where
  there's no context URI, such as in a worker, throws and says to use an
  absolute URL, instead of quietly allowing nothing. The default is resolved
  when a session first checks a URL, so an application without a context
  URI that never retrieves anything doesn't need the config.
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
  - It used to be a predicate, `(url: URL) => boolean | Promise<boolean>`,
    with a default for each runtime: files in the working directory's real
    path in Node.js, and the page's origin in a browser. Allowing a URL as
    well as the default meant calling the default, so it would have had to
    be exported, and a predicate written without it had to know to compare
    against `realpath(cwd())`, not `cwd()`, or a working directory reached
    through a symlink refused every file. A list has none of these problems.
  - In a browser, the default used to be the page's whole origin. It's the
    page's directory now, which is narrower. An application whose documents
    are elsewhere on its origin adds `"/"`. A default of `["/"]` in browsers
    would have kept the origin, but then the default would be different in
    Node.js, where `/` is the whole filesystem.
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
- It's config, because it's a property of the application, like its URI
  scheme plugins, and every session should follow it by default. A session
  can have its own (`SessionOptions.allowRetrieval`), which replaces the
  config's rather than adding to it, for an application that allows
  different things for different sessions. A session can allow less than
  the config, so it can't only add to it. One that allows more lists the
  config's entries too. The application creates its sessions, so it's still
  the application's decision.

## Where it's checked

- `Session` checks it when it retrieves a document that isn't in its
  cache, before it calls `Hyperjump.retrieve`, so it covers `get`,
  `getDocument`, and following references. A subclass that overrides
  `getDocument` to find documents elsewhere first isn't checked for those.
  It's before the URI scheme plugins, so it's before the HTTP cache too,
  and a cached response isn't a way around it.
- `Hyperjump.retrieve` itself isn't checked. It's for URI scheme plugins
  that map to another URI, like `urn:`, and the response they give is
  checked by its URL.
- A refused URL is a `RetrievalNotAllowedError`, thrown as it is, not
  wrapped in a `RetrievalError`. It's distinct from a `RetrievalError` for
  a URL that was allowed and couldn't be retrieved, so tools can tell a
  refused URL (unknown) from a failed one (missing).
- Redirects are checked after the fact. The URL a response came from is
  also checked, after any redirects, and a response from a refused URL is a
  `RetrievalNotAllowedError` whose `uri` is that URL. Its body is
  cancelled. The redirected request is still sent, because redirects aren't
  followed manually. Only its response can't be used, which is what CORS
  does in browsers (see [Known limitations](#known-limitations)).

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

## Known limitations

- `allowRetrieval` can't stop a request that a redirect leads to. It's
  checked on the URL that was asked for and the URL the response came from,
  so a response from a refused URL is never used, but the redirected
  request has already been sent. That's the same protection CORS gives in
  browsers. In Node.js, a request whose sending is the harm, such as a GET
  to an internal endpoint with side effects, isn't prevented. Two stronger
  options: the `http(s):` plugin could refuse redirects
  (`redirect: "error"`), which breaks servers that redirect, or a `fetch`
  dispatcher could check the address it connects to, which also stops DNS
  rebinding but needs undici.
- Someone who can change the filesystem could swap a part of a path for a
  symlink between `realpath` and the read. The response's URL is checked,
  but it's the path the plugin resolved, not necessarily what it opened.
  The file is also opened before that second check, though nothing is read
  from it if it's refused. Opening a FIFO or a device can have an effect.
  Documents are what's untrusted, not the filesystem, so that's out of
  scope.
