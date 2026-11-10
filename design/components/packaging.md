# Packaging

- It's designed for Node.js and browsers. Subpath imports (`#file-scheme`,
  `#node-transport`, …) give browser versions of the parts that need
  Node.js, which bundlers that support the `imports` field choose for a
  browser. A browser version throws when it's used, with a message that
  says it isn't supported there.
- There's one entry point, `@hyperjump/browser`. The package has no side
  effects, so a bundler drops what isn't imported.
- `index.js` imports the parts with versions through their subpath imports,
  and `index.d.ts` exports their declarations directly, because a part and
  its browser version have the same declaration.

Rejected:

- A second entry point for Node.js (`@hyperjump/browser/node`). An
  application that runs in both would have to import from the right one in
  each, and code shared between them couldn't.
