# @hyperjump/browser v2

A generic client for traversing JRef and other JRef-compatible media types,
built for the unified ecosystem. `@hyperjump/json-schema` v2 builds on it.

## Docs

- `design/` is for contributors. Start with `design/README.md`, the index,
  and read only the documents about what you're working on. `principles/`
  are the rules decisions are made by, `style/` is how code is laid out,
  `components/` say how each part works and what was decided, with known
  limitations, and `benchmarks/` are dated measurements. The JRef spec is
  https://github.com/hyperjump-io/json-reference/blob/main/spec.md.
- `website/` is the user documentation.
  It's built into the site at hyperjump.io from `../hyperjump.io`, whose
  README has how to write it. A feature that isn't released gets
  `*Coming soon*` on its own line under its heading. `npm version` replaces
  it with `*Added in vX.Y.Z*` (`scripts/version-docs.js`).
- `TODO.md` is the plan and what's next. It isn't committed.
- Prefer many small documents that each cover one thing. A change to how
  something works updates its document in the same commit. A decision
  that's made goes in its component's document, with what was rejected
  and why.
- No application's concepts in the code or the docs. Browser is a generic
  client (`design/principles/generic-client.md`).

## Development

- `npm test`, `npm run lint`, `npm run type-check`
- The API is declared in hand-written `.d.ts` files next to the JS, which is
  typed with JSDoc. Type-checking includes the declaration files.
- Changes go on the `v2` branch.

## Working agreements

- Ask before committing. Keep unrelated changes in separate commits.
