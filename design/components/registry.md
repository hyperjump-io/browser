# The registry (`src/registry.js`)

Documents an application already has, like a copy of a document bundled
with it, are a session's `registry`. The session asks it before
`allowRetrieval` and the stack, so they're answered without being fetched.

- A registry is an object the session asks for a URL:
  `get(url, { session })` returns a response, or `undefined` to go on to
  `allowRetrieval` and the stack. It can throw, like a fetch, to say a URL
  is the registry's but can't be used. What it does with the URL is its
  own, so a registry that finds documents by an identifier they declare is
  written by the application, and the session never knows what an
  identifier is.
- `registry(entries, { base })` is one by URL. An entry is a body, the
  parts of a response, or a function that makes a response each time. A
  relative URL is resolved against `base` or the context URL.
- An entry that isn't a function is made into a response once, and each
  time it's asked for, the registry answers with a clone. Making a
  response copies a body that's bytes and copies the headers, so changing
  an entry later changes nothing. A clone of a stream body is a branch of
  it, so a stream is answered every time, by every session that shares the
  registry, and what's been read of it stays in memory like any other
  body.
  - Making a response each time from the entry was rejected. A stream can
    be read only once, so the second session would fail, and an entry's
    bytes would be read when it's asked for, not when it's registered.
  - Refusing a stream body was rejected. A clone answers it without code
    of its own. A response
  that isn't for a `file:` URL needs a `Content-Type`, for a media type to
  parse it, so an entry's isn't guessed from its URL.
- `allowRetrieval` doesn't apply to what it answers. `allowRetrieval` keeps
  a document from making the session fetch whatever it names, and a
  document the application gives the session isn't fetched (see
  [What a session can fetch](allow-retrieval.md)).
- Only a `file:` document can refer to a `file:` URL, whatever answers it
  (see [`file:` from `file:`](file-references.md)), so that's checked
  before the registry is asked, and a URL the request can't refer to
  isn't asked for. A response whose URL is another one, like a file, is
  checked too, like a fetched response's. An application can register
  what's in its files, like an editor's buffers, and a document from the
  web shouldn't read them that way.
  - Asking the registry first and checking only what it answers was
    rejected. A registry's function entry, or one the application wrote,
    would run for a URL that's refused.
- Only a `GET` or a `HEAD` is asked, by the URL without its fragment, which
  isn't part of what's fetched. A response without a URL, like one made
  with `new Response`, gets the request's from the session (see
  [Sessions](sessions.md)).
- Its answers are in traces, with the source `"registry"` and no request
  headers, because none were sent. What it throws is recorded too, like a
  failed fetch. Whether a document came from the registry is the first
  thing to find out when a registry doesn't do what's expected.
- A redirect to a URL it has is fetched. The session follows a redirect
  down the stack, and the registry isn't in the stack. Answering it would
  make an entry that's a redirect an alias, which nothing needs.
- The config has one registry. An application that has two combines them
  into one. A list would be one registry split up, and the order would
  matter.

Rejected:

- A layer on the stack. What a layer answers has to be allowed (see
  [What a session can fetch](allow-retrieval.md)), so every registered URL
  would be in `allowRetrieval`. A registry that finds documents by an
  identifier they declare doesn't know its URLs until it reads its
  documents, so they couldn't be listed when the session is made.
- Identifying documents in the session, with a media type plugin hook. An
  application's documents can depend on each other to be identified, like
  one that's read with a format another one defines, so the session would
  have to know how.
