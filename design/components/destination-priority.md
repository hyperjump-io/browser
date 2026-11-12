# Destination priority (`src/layers/destination-priority.js`)

A request gets a priority by its destination, the way a browser loads
stylesheets before images without being told.

- The defaults are about what browsers do: documents, styles, and fonts are
  `high`, images and media are `low`, and the rest stays `auto`. An
  application gives its own, like `{ schema: "high" }`.
- It's only for requests whose priority is `auto`, so a priority the caller
  chose wins.
- The layer below gets a priority of its own that follows the caller's: if
  the caller changes it, the request has the caller's, and if the caller
  changes it back to `auto`, it has the destination's again.
- It marks `priority:default`, with the priority it gave, so what a request
  was given is known even when it never reaches the network, like when the
  cache answers it.

## Where it goes

Above the throttle and the scheduler, which act on the priority it gives.

Rejected:

- Priorities by destination in the session. A session would have to know
  what each destination means, and an application couldn't choose its own
  without replacing the session.
