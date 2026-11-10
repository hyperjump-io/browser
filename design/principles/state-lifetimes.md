# State lives as long as what it's for

State is kept where its lifetime is, so it's shared exactly as widely as it
should be.

| Lifetime | Where it's kept | Like |
| --- | --- | --- |
| One request | The request and its context | A request in a browser |
| One page load | The session (`session.state(layer, init)`) | A tab's in-flight requests |
| A page and its frames | The root session (`session.root.state(…)`) | A page's resource scheduler |
| Longer than any session | The layer object, or what it's given, like a cache store | A browser profile and its connection pool |

- One stack can serve many sessions, so a layer keeps per-session state in
  the session, keyed by the layer, not on itself.
- Whoever builds a stack decides how widely long-lived state is shared, by
  sharing a layer object or a store, or not.
- Work that's shared runs under the signal of the scope that owns it. A
  request a page and its frames share belongs to the page, so a frame that
  closes ends only its own wait.

Rejected:

- Building a stack for each session, so per-session state is in closures.
  The stack couldn't be inspected or shared, and long-lived state would
  have to be passed to every session.
