# Packaging

- It's designed for Node.js and browsers. Subpath imports (`#context-uri`,
  `#real-url`, `#default-uri-scheme-plugins`, …) give browser-compatible
  implementations of the parts that depend on Node.js, which bundlers that
  support the `imports` field select automatically.
- There's one entry point, `@hyperjump/browser`. The JSON and JRef
  utilities had their own, `@hyperjump/browser/json` and
  `@hyperjump/browser/jref`, but nothing was gained by keeping them apart:
  the package has no side effects, so a bundler drops what isn't imported
  either way. Merging them made two names collide. `hasStatus` is the JRef
  one, which is the same function typed for both kinds of document, and
  JRef's `Reviver` is `JrefReviver`.
- The type entry points are declared in the package exports, so TypeScript
  finds the declaration files and the types only they export.
- It had its own CLIs, `rejson` and `jref`, which only parsed and
  stringified. They were removed, so it doesn't depend on `unified-args`.
  What they did belongs to the `hyperjump` CLI (`@hyperjump/cli`). The
  processors they ran, `rejson` and `jref` (`unified().use(parse).use(stringify)`),
  were removed on 2026-10-29: nothing used them, and creating them when the
  module loaded kept `unified` in every bundle that imported the JSON
  utilities. A pipeline uses the plugins
  (`rejsonParse`, `rejsonStringify`, `jrefParse`, `jrefStringify`).
- `@hyperjump/uri` is linked with `file:../uri` until `encodeIriFragment`
  is published.
