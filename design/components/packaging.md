# Packaging

- It's designed for Node.js and browsers. Subpath imports (`#context-uri`,
  `#real-url`, `#default-uri-scheme-plugins`, …) give browser-compatible
  implementations of the parts that depend on Node.js, which bundlers that
  support the `imports` field select automatically.
- The type entry points are declared in the package exports, so TypeScript
  finds the declaration files and the types only they export.
- It had its own CLIs, `rejson` and `jref`, which only parsed and
  stringified. They were removed, so it doesn't depend on `unified-args`.
  What they did belongs to the `hyperjump` CLI (`hjlint`).
- `@hyperjump/uri` is linked with `file:../uri` until `encodeIriFragment`
  is published.
