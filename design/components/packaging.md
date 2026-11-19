# Packaging

- It runs in Node.js and browsers. Subpath imports (`#file-scheme`,
  `#http-cache`, `#context-url`, `#next-task`, and the rest) give a browser
  version of what's different there, and bundlers choose them by the
  `imports` field. A part a browser doesn't support throws when it's used.
- There's one entry point, and the package has no side effects, so a
  bundler drops what isn't imported.
- What `index.js` exports is the public API, and it's in the user docs. A
  module with functions only the library uses, like `PriorityGroup` or
  `mediaTypeForExtension`, is exported by name.
  - Moving the library's own functions to modules of their own was
    rejected. Modules would be split by who uses a function, not by what
    it does.
- Retrieval code (the session, layers, transports, and tracing) never
  imports document code (`src/documents/`, `src/media-types/`,
  `src/json/`, `src/jref/`), so the stack could be a package of its own.
- `unified` and `@types/unist` are dependencies for their types alone. No
  code imports `unified`.
- `@hyperjump/pact` is a dependency for the iterators. It needs the global
  `Iterator`, which sets Node.js 24, Firefox 131, and Safari 18.4.
  `URL.parse` sets Chrome and Edge 126. pact defines classes when it's
  imported, so in an older browser importing the package fails.
  `website/install.md` says the versions, and a newer API is checked
  against them.

Rejected:

- A second entry point for Node.js. Code shared between runtimes couldn't
  import from the right one in each.
- `unified` as an optional peer dependency. Without it, the declarations
  import a module that isn't there, which is a type error for users who
  don't use the plugins.
