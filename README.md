# Hyperjump - Browser

The Hyperjump browser is a hypermedia client for [JRef] and other
JRef-compatible media types. JRef is JSON with references such as
`{ "$ref": "../people/1" }`. The browser retrieves documents over HTTP or from
files and follows the references between them for you, so you can work with
linked documents as if they were one value.

```typescript
import { Hyperjump, jrefStep, jrefValue } from "@hyperjump/browser";

const h = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});
const session = h.session();

const film = await session.get("https://swapi.hyperjump.io/api/films/1");
const director = await jrefStep(session, "director", film);
jrefValue(director); // "George Lucas"
```

- **Safe with documents you don't trust.** A document can't make your app
  retrieve whatever it references. You choose what the browser can retrieve.
- **HTTP done properly.** Responses are cached according to their caching
  headers and stale ones are revalidated.
- **Extensible.** Add your own media types and URI schemes.
- **Built for [unified](https://unifiedjs.com/).** Documents are parsed into
  ASTs that keep source locations, and the parsers and stringifiers work as
  unified plugins.
- **Node.js and browsers.** It runs on the server and in web browsers.

[`@hyperjump/json-schema`](https://github.com/hyperjump-io/json-schema) v2
builds on the Hyperjump browser.

## Install

```bash
npm install @hyperjump/browser
```

This branch is version 2, which isn't released yet. The released version is
1.x and its docs are in the
[1.x README](https://github.com/hyperjump-io/browser/tree/v1#readme).

## Documentation

The documentation is in [`website/`](website/README.md). Start with
[Get started](website/getting-started.md), which browses an API and then files
step by step.

## Contributing

The design docs, principles, and style guide are in
[`design/`](design/README.md). Read the documents about the part you're working
on before you change it.

```bash
npm test               # Run the tests
npm test -- --watch    # Run the tests when files change
npm run lint
npm run type-check
```

The docs are checked with [Vale](https://vale.sh/). Run `vale sync` once to
download the styles, then run `vale website design`.

[JRef]: https://github.com/hyperjump-io/json-reference/blob/main/spec.md
