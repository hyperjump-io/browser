# Hyperjump - Browser

A hypermedia client for
[JRef](https://github.com/hyperjump-io/json-reference/blob/main/spec.md), which
is JSON with references such as `{ "$ref": "../people/1" }`. It retrieves
documents over HTTP or from files and follows the references between them for
you.

**[Read the documentation at hyperjump.io](https://hyperjump.io/browser/)**

```bash
npm install @hyperjump/browser
```

```typescript
import { Hyperjump, browse, jrefValue } from "@hyperjump/browser";

const session = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});

const url = "https://swapi.hyperjump.io/api/films/1#/director";
const director = await browse(session, url);
await jrefValue(session, director); // "George Lucas"
```

The film's document has the director, and the URL's fragment points to it. A
reference in a document works the same way: stepping into one gives you the
value it refers to, from whatever document has it.

- **Transparent references.** Read and select values with selectors like
  `> [key=characters] > * > [key=name]`, and the session retrieves the
  documents they lead into. Only what a selector could match is retrieved.
- **Safe with documents you don't control.** A session retrieves only the URLs
  you allow, and a document from the web can't refer to a `file:` URL.
- **Retrieves like a web browser.** Requests belong to a session, the way a
  page load's do. Each goes through a stack of layers, like an RFC 9111 HTTP
  cache and a scheduler, and ends at a transport chosen by URL scheme. You
  build the stack you need and add your own layers.
- **Formats you add.** JSON and JRef are built in. Add a media type for any
  other format.
- **Node.js and browsers.** Node.js 24 or later, and current browsers. `file:`
  URLs work on the server.

## Documentation

The documentation is at **[hyperjump.io/browser](https://hyperjump.io/browser/)**.

- [Get started](https://hyperjump.io/browser/getting-started/): browse an API
  and files step by step
- [Browse to a URL](https://hyperjump.io/browser/browse-to-a-url/): go to the
  value a URL identifies, following references
- [Read values](https://hyperjump.io/browser/read-values/): read values, and
  step into, visit, find, and select the values under them
- [Hyperjump sessions](https://hyperjump.io/browser/hyperjump-sessions/): fetch
  through a session, and close it
- [What a session can fetch](https://hyperjump.io/browser/allow-retrieval/):
  allow only the URLs your app should fetch
- [Layers](https://hyperjump.io/browser/layers/): build a stack and write your
  own layers
- [HTTP caching](https://hyperjump.io/browser/http-caching/): cache responses
  by their caching headers

Using v1? See the
[v1 README](https://github.com/hyperjump-io/browser/tree/v1#readme).

## Contributing

See [`design/`](design/README.md) for how it works and why. Read the documents
about the part you're working on before you change it. The documentation's
source is in [`website/`](website/README.md).

```bash
npm install
npm test               # Run the tests
npm test -- --watch    # Run the tests when files change
npm run lint
npm run type-check
```

The docs are checked with [Vale](https://vale.sh/). Run `vale sync` once to
download the styles, then run `vale website design`.

## License

MIT
