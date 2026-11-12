# @hyperjump/browser v2

A hypermedia browser: it retrieves documents and follows the references
between them. It retrieves the way a web browser does. Requests belong to a
session, go through a stack of layers (an HTTP cache, a scheduler, and the
application's own), and end at a transport that picks a handler by URL
scheme, including `file:` on the server. The stack is how it retrieves, and
a retrieval feature stays only if it serves loading documents. Documents
(`get`, media types, and the parsers) are built on the session, and
retrieval code never imports them. It replaces
`@hyperjump/browser` v1, a client for JRef documents, and the v2 prototype
on `main`, which won't be released.

## Docs

- `design/` is for contributors. Start with `design/README.md`, the index,
  and read only the documents about what you're working on. `principles/`
  are the rules decisions are made by, `style/` is how code is laid out, and
  `components/` say how each part works and what was decided, with known
  limitations.
- `website/` is the user documentation. It's built into the site at
  hyperjump.io by https://github.com/hyperjump-io/hyperjump.io. The style guide at
  https://github.com/hyperjump-io/hyperjump.io/tree/main/design/style
  says how to write the prose. How to put pages together is at
  https://github.com/hyperjump-io/hyperjump.io/blob/main/design/README.md#writing-docs.
  Vale checks the docs with the rules in `.vale.ini`. Run `vale sync`
  once to download them. A feature that isn't released gets
  `*Coming soon*` on its own line under its heading. `npm version`
  replaces it with `*Added in vX.Y.Z*` (`scripts/version-docs.js`).
- `TODO.md` is the plan and what's next. It isn't committed.
- Prefer many small documents that each cover one thing. A change to how
  something works updates its document in the same commit. A decision
  that's made goes in its component's document, with what was rejected
  and why. Design docs record decisions, not history: no "before",
  "used to", "replaced", or dates of changes. An old design that was
  dropped for a reason is a rejected alternative.
- No application's concepts in the code or the docs, like JSON Schema's.
  Applications build on the layers and sessions.

## Development

- `npm test`, `npm run lint`, `npm run type-check`
- The API is declared in hand-written `.d.ts` files next to the JS, which is
  typed with JSDoc. Type-checking includes the declaration files.
- Tests are next to what they test, as `*.test.js`. Test helpers are in
  `src/test-helpers/`, which isn't published.

## Working agreements

- Ask before committing. Keep unrelated changes in separate commits.
