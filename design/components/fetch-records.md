# Fetch records (`src/fetch-record.js`)

Every `session.fetch` has a record: what was asked for, what caused it,
what each layer did, and how it ended. A response has it as
`responseMeta(response).record`, and a layer as `ctx.record`.

- A record is made for every request, watched or not, because a later
  request names an earlier one's record as its initiator.
- A layer says what it did with `record.mark(name, detail)`, named for the
  layer, like `"scheduler:queued"`. Marks are for watching: no layer reads
  another's (see
  [How layers communicate](../principles/how-layers-communicate.md)).
- Only the session makes a record (`startRecord`) and writes its response
  (`recordResponse`, `recordChunk`, `recordEnd`), through state in a
  `WeakMap`. To everyone else it's read-only. `FetchRecord` is exported for
  `instanceof`, with a private declared constructor, so `new FetchRecord()` is a type
  error, not a record that throws when it's made.
- `initiator` is the record of the request that caused this one, so records
  make a tree. It's not only for watching: only a `file:` initiator can
  refer to a `file:` URL (see [`file:` from `file:`](file-references.md)).
- `referrer` is the URL of the document the request came from: the
  caller's `referrer`, or the initiator's response's URL. It's worked out
  when the request starts, and the `file:` rule judges by it.
- `session.observe(observer)` sees each request start, be marked, get its
  response, and end. An observer that throws doesn't stop the request or
  the others. Its error is thrown again later, as uncaught.
- A body is wrapped only while someone is watching, because it costs a
  stream for every response. So `endTime` and `bodySize` are known only for
  watched requests. Bodies are kept for an observer that asks: each chunk
  is copied as it comes, because the caller can change it, and they're
  joined when `body` is first read.

Rejected:

- Sessions as `EventTarget`s. The session needs to know whether anyone is
  watching or wants bodies.
- Records only while something is watching. An initiator from before would
  be missing.
