# Packaging

- It's designed for Node.js and browsers. Subpath imports (`#file-scheme`,
  `#node-transport`, `#file-cache-store`) give browser versions of the
  parts that need Node.js, and of the HTTP cache (`#http-cache`), which a
  browser has already. Bundlers that support the `imports` field choose
  them for a browser. A browser version throws when it's used, with a
  message that says it isn't supported there.
- What's different in each runtime without being unsupported in one has a
  version for each too: the context URL (`#context-url`), a `file:` URL's
  real path (`#real-url`), and the default stack (`#default-stack`).
- There's one entry point, `@hyperjump/browser`. The package has no side
  effects, so a bundler drops what isn't imported.
- `index.js` imports the parts with versions through their subpath imports,
  and `index.d.ts` exports their declarations directly, because a part and
  its browser version have the same declaration.

Rejected:

- A second entry point for Node.js (`@hyperjump/browser/node`). An
  application that runs in both would have to import from the right one in
  each, and code shared between them couldn't.
