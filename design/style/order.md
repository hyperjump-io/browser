# Order in a file

What a file exports comes first, and the helpers it uses come after it.
Opening a file shows what it does, without scrolling past the helpers to
get to the point.

- Imports, then constants the exports use, then the exports, then the
  helpers that aren't exported.
- A file with several exports has all of them before its helpers.
- A test file is its `describe` and `test` calls, then its helpers.
- Something used while the module loads has to come before what uses it,
  because only function declarations are hoisted.
