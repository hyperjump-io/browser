# Batching (`src/layers/batch.js`)

Requests made at about the same time are sent together. The layer does the
timing. What together means is the application's: `match` says which
requests go together, and `execute` sends them, usually as one combined
request, and splits the answer into a response for each.

- A batch is sent at the end of the task it was started in, or after
  `windowMs`, or as soon as it has `maxSize` requests.
- Batches are collected for a scope: each session, or a session and its
  children with `scope: "root"`.
- A batch belongs to its scope, not to the caller that came first.
  `execute` gets a context with the scope's session, and the request it
  makes has the session's signal, so one caller aborting doesn't fail the
  others, and closing the session stops it (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).
- A caller that aborts before the batch is sent is taken out of it. If that
  leaves the batch empty, nothing is sent. A caller that aborts after the batch
  is sent stops waiting, and its response's body is cancelled when it comes.
- `execute` gets the most urgent priority of the batch's callers (see
  [Priorities](priorities.md)).
- An `execute` that returns the wrong number of responses fails every
  request in the batch, because which response is whose can't be known.
- A request that joins a batch marks `batch:queued`, with its position.

Rejected:

- Combining requests in the layer, like as a JSON array or a `multipart`
  body. Every API that batches does it differently.
