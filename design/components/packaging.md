# Packaging

- It's designed for Node.js and browsers. Subpath imports (`#file-scheme`,
  `#node-transport`, `#file-cache-store`) give browser versions of the
  parts that need Node.js, and of the HTTP cache (`#http-cache`), which a
  browser has already. Bundlers that support the `imports` field choose
  them for a browser. A browser version throws when it's used, with a
  message that says it isn't supported there.
- What's different in each runtime without being unsupported in one has a
  version for each too: the context URL (`#context-url`), a `file:` URL's
  real path (`#real-url`), the default stack (`#default-stack`), a
  file's URL from its path (`#path-to-url`), and waiting for the next task
  (`#next-task`).
- There's one entry point, `@hyperjump/browser`. The package has no side
  effects, so a bundler drops what isn't imported.
- `index.js` imports the parts with versions through their subpath imports,
  and `index.d.ts` exports their declarations directly, because a part and
  its browser version have the same declaration.
- Retrieval code never imports document code. Retrieval is the session,
  the layers, the transports, and tracing. Documents are `src/documents/`,
  `src/media-types/`, `src/json/`, and `src/jref/`, and they're built on
  it, so the stack could be a package of its own.
- `unified` is a dependency for its types alone. The declarations of the
  unified plugins import its `Plugin` type, and no code imports it, so it's
  never loaded unless an application uses it. `@types/unist` is one for
  the same reason: the AST's declarations import `Position` and `Data`.
- `@hyperjump/pact` is a dependency for the iterators the `json*` and
  `jref*` functions return. Its iterators extend the global `Iterator`,
  so it needs an engine that has one, and its `engines` says Node.js 24
  or later, so this package's does too.
- The browsers it runs in are Chrome and Edge 126, Firefox 131, and
  Safari 18.4, or later. The `Iterator` that pact extends sets Firefox's
  and Safari's, and `URL.parse` sets Chrome's. pact's classes are defined
  when it's imported, and there's one entry point, so in an older browser
  importing the package fails, not only using an iterator. A newer API
  that's used is checked against these, and `website/install.md` says
  them.

Rejected:

- A second entry point for Node.js (`@hyperjump/browser/node`). An
  application that runs in both would have to import from the right one in
  each, and code shared between them couldn't.
- `unified` as an optional peer dependency. Without it installed, the
  entry point's declarations import a module that isn't there, which is a
  type error for the users who don't use the plugins.
