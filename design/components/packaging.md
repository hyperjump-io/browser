# Packaging

- It's designed for Node.js and browsers. Subpath imports (`#context-uri`,
  `#real-url`, `#default-uri-scheme-plugins`, …) give browser-compatible
  implementations of the parts that depend on Node.js, which bundlers that
  support the `imports` field select automatically.
- There's one entry point, `@hyperjump/browser`. Separate ones for the
  JSON and JRef utilities, `@hyperjump/browser/json` and
  `@hyperjump/browser/jref`, were rejected because nothing is gained by
  keeping them apart: the package has no side effects, so a bundler drops
  what isn't imported either way. With one entry point, two names collide.
  `hasStatus` is the JRef one, which is the same function typed for both
  kinds of document, and JRef's `Reviver` is `JrefReviver`.
- The type entry points are declared in the package exports, so TypeScript
  finds the declaration files and the types only they export.
- It doesn't have CLIs, so it doesn't depend on `unified-args`. A CLI to
  parse and stringify belongs to the `hyperjump` CLI (`@hyperjump/cli`).
- It doesn't export processors (`unified().use(parse).use(stringify)`).
  Creating them when the module loads would keep `unified` in every bundle
  that imports the JSON utilities. A pipeline uses the plugins
  (`rejsonParse`, `rejsonStringify`, `jrefParse`, `jrefStringify`).
