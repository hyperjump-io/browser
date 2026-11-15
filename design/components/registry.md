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
  parts of a response, or a function that makes a response each time.
  Entries are copied, so changing them later changes nothing, and a
  relative URL is resolved against `base` or the context URL. A response
  that isn't for a `file:` URL needs a `Content-Type`, for a media type to
  parse it, so an entry's isn't guessed from its URL.
- `allowRetrieval` doesn't apply to what it answers. `allowRetrieval` keeps
  a document from making the session fetch whatever it names, and a
  document the application gives the session isn't fetched (see
  [What a session can fetch](allow-retrieval.md)).
- Only a `GET` or a `HEAD` is asked, by the URL without its fragment, which
  isn't part of what's fetched. A response without a URL, like one made
  with `new Response`, gets the request's.
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
