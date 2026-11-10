# Tests

- A test file is next to the file it tests, as `*.test.js`, with vitest's
  `describe`, `test`, and `expect`.
- A test of HTTP behavior uses a real server on a random local port
  (`src/test-helpers/server.js`), so what's tested is what `fetch` does,
  not what a mock says it does.
- A test of timing or ordering uses a transport that answers when the test
  says so (`src/test-helpers/controlled.js`), not timeouts that happen to be
  long enough. A test that needs a clock gives the layer one (`now`).
- A test says what it checks in its name, and in an assertion's message
  when the name doesn't say which part failed.
