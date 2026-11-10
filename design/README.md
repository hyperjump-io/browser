# Design

`@hyperjump/browser` is a `fetch` inspired by web browsers: requests belong
to a session, go through a stack of layers, and end at a transport that
picks a handler by URL scheme. These documents record decisions: what the
code does, why, and what was rejected and why. They don't record history,
such as what the code used to do or when it changed. That's in git. The
`.d.ts` files in `src/` are the source of truth for the API. Documentation
for users is in [`website/`](../website/README.md).

## How it's organized

- **[Principles](principles/README.md)**: the rules decisions are made by.
- **[Style](style/README.md)**: how code here is laid out and written.
- **Components**: how each part works, what was decided, and what was
  rejected, with known limitations.

## Components
