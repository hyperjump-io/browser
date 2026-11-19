# The registry (`src/registry.js`)

Documents an application already has, like a copy bundled with it, are a
session's `registry`. The session asks it before `allowRetrieval` and the
stack, so they're answered without being fetched.

- A registry is `get(url, { session })`, which returns a response, or
  `undefined` to go on. It can throw to say a URL is its own but can't be
  used. A registry that finds documents by an identifier they declare is
  the application's, so the session never knows what an identifier is.
- `registry(entries, { base })` is one by URL. An entry is a body, the
  parts of a response, or a function that makes one.
- An entry that isn't a function is made into a response once and
  answered with a clone, so changing an entry later changes nothing. A
  stream is answered every time, by every session, and stays in memory like
  any body.
  - Making a response each time was rejected. A stream is read only once,
    and an entry's bytes would be read when it's asked for, not when it's
    registered.
  - Refusing a stream body was rejected. A clone answers it without code
    of its own.
- An entry's `Content-Type` isn't guessed from its URL. A response that
  isn't for a `file:` URL needs one for a media type to parse it.
- `allowRetrieval` doesn't apply. It keeps documents from choosing what's
  fetched, and nothing is fetched.
- The [`file:` from `file:`](file-references.md) rule does, before the
  registry is asked, so a function entry doesn't run for a refused URL.
  An application can register its files, like an editor's buffers.
- Only a `GET` or `HEAD` is asked, by the URL without its fragment.
- Its answers are in traces with the source `"registry"`, and so are its
  errors. Whether a document came from it is the first thing to check.
- A redirect to a URL it has is fetched. Redirects go down the stack, and
  answering one would make a redirect entry an alias, which nothing needs.
- A session has one registry. A list would be one registry split up, with an
  order that matters.

Rejected:

- A layer. What a layer answers has to be in `allowRetrieval`, and a
  registry by identifier doesn't know its URLs until it reads its documents.
- Identifying documents in the session, with a media type plugin hook.
  Documents can depend on each other to be identified, so the session would
  have to know how.
