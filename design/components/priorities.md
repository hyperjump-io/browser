# Priorities (`src/priority.js`)

A request's priority is `high`, `auto`, or `low`, like `fetchpriority`, and
it can change while the request waits, the way a browser raises an image's
priority when it scrolls into view.

- A priority is a signal, like an `AbortSignal`: a `PriorityController`
  changes its `PrioritySignal`, and layers read `value` and listen for
  `"change"`. `PrioritySignal.of(value)` never changes.
- Only a controller can change a signal. The signal gives this module its
  setter in a `WeakMap`.
- A request several callers share, like a document asked for again while
  it's retrieved (see [Documents](documents.md)), has a `PriorityGroup`'s
  signal: the most urgent of the callers still waiting. A group with no
  members keeps its last value, because nobody is waiting to care. A signal can join more than once, and
  leaves when each has left.

Rejected:

- A priority as a string on the context. It couldn't change, and copies of
  the context wouldn't see a change.
- A priority from what a resource is for, like `Request.destination`. A
  session loads documents, so there are no kinds to tell apart.
- `signal.set`. Anything that could read a priority could change it.
