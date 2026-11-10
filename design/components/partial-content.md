# Partial content (`src/http-cache/ranges.js`)

The HTTP cache answers `Range` requests from what it has, and stores 206s as
parts of the whole representation (RFC 9110 §14, RFC 9111 §3.3 and §3.4).

- A `GET` with one byte range is answered from a fresh entry that has it,
  whether it's a whole copy or parts: a 206 with its `Content-Range`, or a
  416 when the range starts past the end. Each form is supported: `a-b`,
  `a-`, and `-n`.
- A 206 is stored as a part of the representation, with the status the
  whole has (200). `body` is the parts' bytes one after another, and
  `partial` says where each part is, so a store keeps it like any other
  entry, on disk too.
- Parts are joined only when they have the same strong `ETag` and length.
  RFC 9111 only lets a cache join parts with the same strong validator, so
  the bytes of two versions are never mixed. Otherwise, the new part
  replaces what's stored. Where parts overlap, the new bytes win.
- Parts that add up to the whole representation become a whole entry, which
  answers requests for all of it too. Until then, a request for all of it
  goes to the network.
- A server that sends all of it for a range, with a 200, gives a whole copy,
  which is stored and answers later ranges.
- A request for several ranges at once bypasses the cache. `If-Range` makes a
  request conditional, which the Fetch standard says bypasses it too.
- An entry's request headers, for `Vary`, don't include `Range` or
  `If-Range`, because a range isn't what an entry is for.

Rejected:

- Several ranges at once, as `multipart/byteranges`. Few servers send it,
  and joining its parts would mean parsing it.
- Joining parts with a weak `ETag` or a `Last-Modified`. RFC 9111 doesn't
  allow it, and a file can change within the same second.
