# Priorities (`src/priority.js`)

A request's priority is `high`, `auto`, or `low`, like `fetchpriority` in
browsers, and it can change while the request waits, the way a browser raises
an image's priority when it scrolls into view.

- A priority is a signal, like an `AbortSignal`: a `PriorityController`
  changes its `PrioritySignal`, and layers read its `value` and listen for
  `"change"`. A layer that holds requests back, like the scheduler, moves a
  waiting request when its priority changes.
- Only a controller can change a signal. The signal gives this module its
  setter, in a `WeakMap`, when it's created. A signal of a value that never
  changes is `PrioritySignal.of(value)`.
- A request that several callers share, like one dedupe or batching
  combines, has a `PriorityGroup`'s signal: the most urgent priority of the
  callers still waiting. A caller that joins with a higher priority moves
  the request up, and one that leaves moves it back down. A group with no
  members keeps its last value, because nobody is waiting to care.
- A signal can be a member of a group more than once, so the same caller
  joining twice leaves only when both have left.

Rejected:

- A priority as a string on the context. It couldn't change while a request
  waits, and copies of the context, which layers make, wouldn't see a
  change.
- A setter on the signal (`signal.set`). Anything that could read a
  request's priority could change it.
