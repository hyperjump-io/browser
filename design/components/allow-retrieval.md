# What a session can fetch (`src/allowed-urls.js`)

Documents aren't trusted. A document shouldn't be able to make an
application fetch whatever it names, like an internal address or a file
outside the project. So a session fetches only the URLs its
`allowRetrieval` allows, and the default allows only what's local to the
application.

- `allowRetrieval` is a session option, a list of URLs (`string[]`). One
  that ends with `/` allows every URL under it, and any other allows only
  itself. It's the rule `headers` keys have, from `src/url-entries.js`, so
  the two can't disagree about which URLs an entry is for (see
  [Request headers](request-headers.md)). An origin without a path, like
  `https://example.com`, parses to `https://example.com/`, so it allows the
  whole origin.
- Entries and the URLs checked against them are compared as parsed URLs,
  without fragments, so case, dot segments, and default ports can't get
  around an entry.
- A relative entry is resolved against `baseURL`, or without one against
  the context URL: the working directory in Node.js and the page in a
  browser (`#context-url`). The session reads the context URL once, when
  it's created, and `allowed-urls.js` is given the base rather than reading
  it, so its tests give it one instead of changing the working directory.
- Entries are resolved when the session is created, so one that isn't a
  URL, or is relative where there's no base, throws a `TypeError` there.
- The default is what's local to the application, which is different in
  each runtime (`#context-url`, beside the context URL):
  - In Node.js it's `["./"]`, the working directory. Its files are the
    project's, and `/` would be the whole filesystem.
  - In a browser it's `["/"]`, the page's origin. A page's documents are
    on its origin, but not always in its directory, and an origin is
    what a browser trusts as one site. Browsers can't read `file:` URLs
    anyway.
  - With a `baseURL`, it's resolved against that: its directory in
    Node.js and its origin in a browser.
  - `allowed-urls.js` is given the default with the base, so its tests
    give it either one.
  - One default for every runtime, like `["./"]`, was rejected. In a
    browser, an application's documents elsewhere on its origin would be
    refused, and `["/"]` in Node.js is the whole filesystem.

  Where there's no base, like in a worker without a `baseURL`, the
  default can't be resolved. The session keeps the error and throws it
  when it checks a URL, so a session that never fetches doesn't need a list.
  - Following references across origins is what a client like this is for,
    so an application that fetches from the web lists its origins.
    Allowing everything by default, with applications that need it opting
    in, was rejected. The threat is the same, and users would only be safe
    if they opted in.
  - It's data, so an application extends the default by writing it out,
    like `["./", "https://api.example.com/"]`, and `[]` allows nothing.
- A `data:` URL is always allowed. It's its own content, so nothing is
  fetched, and a list couldn't allow it anyway: it has no `/` to be a
  prefix of.
- A child session has its parent's list unless it's given its own, which
  replaces its parent's instead of adding to it, so a child can allow less.
  A child that allows more is still the application's choice, since only
  the application makes sessions. A parent's default is its own base's
  directory, so a child with another `baseURL` still has it.

Rejected:

- A predicate, `(url: URL) => boolean | Promise<boolean>`. Allowing a URL
  as well as the default would mean calling the default, so it would have
  to be exported. A predicate written without it would have to know to
  compare a `file:` URL by its real path, or a working directory reached
  through a symlink would refuse every file. A list has neither problem.
- A predicate as well as the list, for what a list can't say. Whoever used
  it would have the problem the list solves.
- Globs. Glob syntax collides with URLs, where `?`, `*`, `[`, and `:`
  already mean something, and a glob matched against a URL's text lets
  `https://*.example.com/` match `https://evil.test/x.example.com/`. What
  prefixes can't say, like any subdomain, could be `URLPattern` entries
  when something needs it, as for `headers` keys.
- A layer. The stack is shared by sessions, so each session's list would
  have to reach the layer some other way, and a layer above it, like the
  resource map, would answer before it. And the HTTP cache would have to
  be below it, so a cached response isn't a way around it.

## Where it's checked

The session checks every URL it fetches before the stack does anything
with it, the way it adds `headers`:

- The URL that's asked for, before its headers are found. A refused URL
  doesn't get the session's headers, so a headers function isn't called
  for it. It's still recorded, with its error, like a request a browser
  blocks, so a trace or a HAR export shows it (see
  [Fetch records](fetch-records.md)).
- Where a redirect leads, before it's followed (see
  [Redirects](redirects.md)). The session follows each step with a new
  request down the stack, so a server can't make it send a request to a
  URL it doesn't allow.
- A response's URL, when it isn't the URL that was asked for. The `file:`
  scheme gives the real path of a file reached through a symlink as its
  response's URL, and a browser
  that follows a redirect itself gives where it led. A response from a URL
  that isn't allowed isn't used, and its body is cancelled.

A refused URL is a network error, the `TypeError` `fetch` rejects with (see
[Like a web browser](../principles/like-a-web-browser.md)). Its message
names the URL and says to add it to the session's `allowRetrieval`.

Because the session checks a URL before the stack sees it, what the
registry, the resource map, or the HTTP cache would answer has to be
allowed too. A cached response isn't a way around the list. A bundled copy
of a well-known document is listed in `allowRetrieval`, like its URL would
be if it were fetched. The session can't know which layer will answer a
URL, and checking below the layers that don't fetch would mean checking
below the cache.

## Symlinks

- A symlink in an allowed directory can point outside it. In Node.js, a
  `file:` URL is compared by its real path (`realpath`, `#real-url`), and
  so are `file:` entries. So a working directory reached through a symlink
  allows its own files, and a symlink out of it is refused before the file
  is opened.
- A `file:` entry's real path is found the first time the session checks a
  URL, and kept for the session, which is a snapshot anyway.
- A file that doesn't exist has no real path, so its path is checked as
  it's written. If it's allowed, fetching it fails as missing rather than
  refused.
- A `file:` URL with a host, and an entry with one, is compared as it is.
  On Windows its path is a UNC path, and `realpath` would connect to the
  host, with the user's credentials, before the URL is refused. A document
  can name any host, so the check can't touch it.
- The `file:` scheme's `root` is the transport's own limit, for every
  session on the stack, and `allowRetrieval` is each session's (see
  [The `file:` scheme](file-scheme.md)). The transport finds a file's real
  path too, so each `file:` fetch finds it twice.

## Known limitations

- A URL is checked, not the address it connects to, so a host whose DNS
  points at an internal address is allowed if its URL is. A `fetch`
  dispatcher could check the address, which would also stop DNS rebinding,
  but it needs `undici`.
- In a browser, the browser follows redirects and sends the request where
  one leads before the session sees it. Only the response is refused,
  which is the protection CORS gives anyway.
- Someone who can change the filesystem could swap part of a path for a
  symlink between the session's `realpath` and the read. The response's
  URL is checked, but the file is open by then, though nothing is read
  from it. Documents are what's untrusted, not the filesystem.
