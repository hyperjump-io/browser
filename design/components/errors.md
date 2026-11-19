# Errors (`src/response-meta.js`, `src/json/coded-error.js`)

Every failure an application might handle has a message for a person and a
`cause.code` for code, and its `url` is the exact URL it's about. The
codes are listed in [`website/errors.md`](../../website/errors.md).

- A failure to retrieve is a network error, the `TypeError` `fetch`
  rejects with (`networkError`). Any other failure, like a pointer that
  isn't found or a document that can't be used, is an `Error`
  (`codedError`). A failure is never an error response (see
  [Like a web browser](../principles/like-a-web-browser.md)).
- The message says what went wrong and names the URL. A failure an option
  causes names the option, like `allowRetrieval`, so whoever reads it knows
  what to change. A `file:` URL in a message is relative to the working
  directory (see [Local paths in errors](file-urls.md)). The `url` is
  exact: the one asked for, or where a redirect or a response led when
  that's what was refused.
- A failure from the system has the system's error as its cause, with its
  code, like `ENOENT` or `ENOTFOUND`, as Node.js's `fetch` gives it. A
  filesystem error other than a missing file or a refused permission is
  said by its code, because the system's message says the absolute path.
- A failure the library makes has `{ code }` as its cause, which can say
  more, like a `status` or a `chain`. A code is named like Node.js's, and
  is Chrome's where Chrome has a name for the network error.
- An abort isn't a network error. It's the signal's reason, as in `fetch`.
- A browser's `fetch` tells a page nothing about why it failed, so a page
  can't probe what's behind a URL. Here the caller is the application and
  only documents are untrusted, so the reason goes to the caller. It's in
  the request's fetch record too, so traces show it.
- A mistake in how a function is called is a `TypeError` or a `RangeError`
  with no code, as the platform's are: a URL that isn't one, a pointer
  that isn't a JSON Pointer, a value `fromJs` can't represent. It's a bug
  to fix, not something to catch.
- The unified plugins report syntax errors as `VFileMessage`s, which is how
  unified reports.

Rejected:

- Only a message, as in a browser. Code that reacts to a failure would
  match text that's meant for a person and changes.
- Error classes, like `RetrievalNotAllowedError`. A caller would import
  them, and `instanceof` fails with two copies of the package installed. A
  code is a value.
- A `code` on the `TypeError` itself. Node.js's `fetch` gives the reason in
  `cause`, so it would be in two places depending on who made the error.
- Codes of the library's own for the system's failures, like
  `ERR_FILE_NOT_FOUND`. Every system code would need one, and translating
  loses what the system's error says.
- One code for every pointer failure. A property that isn't there is often
  fine, and a step that makes no sense isn't.
- A syntax error's `ruleId` as the code. Code would have to list every rule
  to know it's a syntax error.
- A `TypeError` for `toJson` with an invalid value. The tree is a
  document's data, so it's a failure, not a mistake in the call.
