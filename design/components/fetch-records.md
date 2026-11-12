# Fetch records (`src/fetch-record.js`)

Every `session.fetch` has a record: what was asked for, what caused it,
what each layer did with it, and how it ended. A response has it as
`responseMeta(response).record`, and a layer has it as `ctx.record`.

- A record is made for every request, watched or not, because a later
  request names an earlier one's record as its initiator, and that has to
  work without anyone watching.
- A layer says what it did with `record.mark(name, detail)`. Each built-in
  layer's marks start with its name, like `"scheduler:queued"`. Marks are
  for watching: no layer reads another's (see
  [How layers communicate](../principles/how-layers-communicate.md)).
- The session writes what a record says about its response, and nobody
  else can. The record gives this module its state, in a `WeakMap`, when
  it's made, and the session writes it with `recordResponse`,
  `recordChunk`, and `recordEnd`. To everyone else, a record is read-only.
- `initiator` is the record of the request that caused this one. The caller
  gives the earlier request's response or record, and the records make a
  tree. It's what caused a request, not only for watching: only a `file:`
  initiator can refer to a `file:` URL (see
  [`file:` from `file:`](file-references.md)).
- `session.observe(observer)` sees each request of the session and its
  children start, be marked, get its response, and end. An observer that
  throws doesn't stop the request or the other observers. Its error is
  thrown later, where it's reported as uncaught.
- A body is wrapped to know when it's done, and how big it was, only while
  someone is watching, because wrapping costs a stream for every response.
  So `endTime` and `bodySize` are known only for requests that were watched.
  An observer that asks for bodies gets them kept on the records.

Rejected:

- Sessions as `EventTarget`s for observers. The session needs to know
  whether anyone is watching, and whether anyone wants bodies, which an
  `EventTarget` doesn't say.
- Records only while something is watching. An initiator from before
  anyone watched would be missing.
