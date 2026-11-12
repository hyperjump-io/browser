# Network errors (`networkError`, `src/response-meta.js`)

A failure is a network error, the `TypeError` `fetch` rejects with (see
[Like a web browser](../principles/like-a-web-browser.md)). It's for two
readers: a person reads its message, and code reads its `cause.code`.

- The message says what went wrong and names the URL, like
  "`'file:///project/a.json'` doesn't exist". A failure an option causes
  names the option, like `allowRetrieval` or `maxRedirects`, so whoever
  reads it knows what to change.
- `cause` says why to code, with a `code`:
  - A failure that comes from the system has the system's error as its
    cause, with the system's code. A file that's missing is `ENOENT` from
    the filesystem, and a host that isn't found is Node.js's
    `ENOTFOUND`. Node.js's `fetch` already gives the reason this way, so
    code that handles it handles this library's failures too.
  - A failure a layer makes itself has `{ code }` as its cause. A code is
    named like Node.js's own codes. Where Chrome has a name for the network
    error, the code is Chrome's (`ERR_TOO_MANY_REDIRECTS`,
    `ERR_UNKNOWN_URL_SCHEME`, `ERR_UNSAFE_REDIRECT`, `ERR_CACHE_MISS`,
    `ERR_METHOD_NOT_SUPPORTED`).
- An abort isn't a network error. It's the signal's reason, as it is in
  `fetch`.

| Code | Failure | Where |
| --- | --- | --- |
| `ERR_RETRIEVAL_NOT_ALLOWED` | A URL, where a redirect leads, or a response's URL isn't in `allowRetrieval` | session ([What a session can fetch](allow-retrieval.md)) |
| `ERR_FILE_REFERENCE_NOT_ALLOWED` | A `file:` URL from a document that isn't a file | session ([`file:` from `file:`](file-references.md)) |
| `ERR_UNEXPECTED_REDIRECT` | A redirect when `redirect` is `"error"` | session ([Redirects](redirects.md)) |
| `ERR_TOO_MANY_REDIRECTS` | More redirects than `maxRedirects` | session |
| `ERR_UNSAFE_REDIRECT` | A redirect to a scheme that isn't in `redirectSchemes` | session |
| `ERR_CACHE_MISS` | Nothing cached for `only-if-cached` | [HTTP cache](http-cache.md) |
| `ERR_NOT_IN_REGISTRY` | A URL that isn't registered, with `onMiss: "error"` | [The registry](registry.md) |
| `ERR_UNKNOWN_URL_SCHEME` | A scheme without a fetcher | [The scheme transport](scheme-transport.md) |
| `ERR_METHOD_NOT_SUPPORTED` | A `file:` URL with a method other than `GET` or `HEAD` | [The `file:` scheme](file-scheme.md) |
| `ERR_OUTSIDE_ROOT` | A file outside the `file:` scheme's `root` | the `file:` scheme |
| `ERR_NOT_A_FILE` | A `file:` URL that's a directory or something else that isn't a file | the `file:` scheme |
| From the filesystem, like `ENOENT` or `EACCES` | A file that's missing or can't be read | the `file:` scheme |
| Node.js's, like `ERR_INVALID_FILE_URL_HOST` | A `file:` URL that isn't a path | the `file:` scheme |
| The runtime's, like `ENOTFOUND` or `ECONNREFUSED` | A fetch that failed | `networkFetcher` |

A browser's `fetch` tells a page nothing about why it failed, so a page
can't probe what's behind a URL, and the reason goes only to devtools.
Here the reason goes to the caller, which is the application, and only
documents are untrusted. The message is in the request's fetch record too,
so a trace or a HAR export shows it (see [Fetch records](fetch-records.md)).

Rejected:

- Only a message, as in a browser. Code that reacts to a failure, like a
  language server that reports a missing file differently from a refused
  one, would have to match the message's text, and a message is for a
  person, so it changes.
- Error classes, like `RetrievalNotAllowedError extends TypeError`. A
  caller would import the class to check it, and `instanceof` fails when
  two copies of the package are installed. A code is a value.
- A `code` on the `TypeError` itself. Node.js's `fetch` gives the reason in
  `cause`, so the reason would be in two places depending on who made the
  error.
- Error responses, like a 404 for a missing file. A status is what a
  server says, and for these no server answered (see
  [Like a web browser](../principles/like-a-web-browser.md)).
- Codes of this library's own for the system's failures, like
  `ERR_FILE_NOT_FOUND` for `ENOENT`. Every code the system has would need
  one, and translating them loses what the system's error says.
