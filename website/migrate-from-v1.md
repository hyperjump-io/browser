# Migrate from v1

v2 browses documents the way v1 did. You go to a URL and step into values,
and the browser follows the references you reach. What's different is where
that happens. v1's functions shared global plugins and fetched any URL. In
v2 a Hyperjump session holds the configuration and fetches only the URLs
you allow. Every function that can
follow a reference takes the session.

This page lists each change that can break code, and what to do about it.
TypeScript reports most of them, but not the ones about what a session
fetches, which don't change any types.

## Requirements

v2 needs Node.js 24 or later. In a web browser, it needs Chrome 126 or later,
Edge 126 or later, Firefox 131 or later, or Safari 18.4 or later. For more
information, see [Install](install.md).

## A session fetches only the URLs you allow

v1 fetched any URL that a document referred to. A Hyperjump session fetches
only the URLs its `allowRetrieval` allows. By default, that's the working
directory in Node.js and the page's origin in a browser, so a session needs
`allowRetrieval` to fetch from an API:

```typescript
// v1
const film = await get("https://swapi.hyperjump.io/api/films/1");

// v2
const session = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});
const film = await browse(session, "https://swapi.hyperjump.io/api/films/1");
```

A URL that isn't allowed is a network error whose `cause.code` is
`"ERR_RETRIEVAL_NOT_ALLOWED"`. For more information, see
[What a session can fetch](allow-retrieval.md).

## Browse with a session

`get` is `browse`, and it takes the Hyperjump session first. It gives you a
target where v1 gave you a `Browser`. Pass the target to the `jref`
functions:

```typescript
// v1
import { get, step, value } from "@hyperjump/browser";

const luke = await get("https://swapi.hyperjump.io/api/people/1");
const name = await step("name", luke);
value(name); // "Luke Skywalker"

// v2
import { Hyperjump, browse, jrefStep, jrefValue } from "@hyperjump/browser";

const session = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});
const luke = await browse(session, "https://swapi.hyperjump.io/api/people/1");
const name = await jrefStep(session, "name", luke);
await jrefValue(session, name); // "Luke Skywalker"
```

A target isn't a cursor that you read `uri`, `document`, and `cursor` from.
For the URL that identifies its value, use `jrefLocation`. For more
information, see [Browse to a URL](browse-to-a-url.md).

In v1, `get(url, browser)` resolved a relative URL against the browser's
document. In v2, pass the target that you're following the reference from as
`referencedFrom`:

```typescript
// v1
const homeworld = await get("../planets/1", luke);

// v2
const homeworld = await browse(session, "../planets/1", {
  referencedFrom: luke
});
```

## The functions that read values

Each function that reads a value takes the Hyperjump session first and the
target last, and returns a promise, because it can follow a reference.
Unlike v1's `step`, none of them take their arguments one at a time.

| v1 | v2 |
| --- | --- |
| `value(browser)` | `jrefValue(session, target)`, for a string, number, boolean, or null |
| `typeOf(browser)` | `jrefJsonType(session, target)` |
| `has(key, browser)` | `jrefObjectHas(session, key, target)` |
| `length(browser)` | None. Count the items of `jrefArrayIter`. |
| `step(key, browser)` | `jrefStep(session, key, target)` |
| `iter(browser)` | `jrefArrayIter(session, target)` |
| `values(browser)` | `jrefObjectValues(session, target)` |
| `entries(browser)` | `jrefObjectEntries(session, target)` |
| `keys(browser)` | `jrefObjectKeys(session, target)`, as an async iterator |

v1's `value` gave you an object or an array as JavaScript, with the
references in it as `Reference` objects. `jrefValue` throws an error whose
`cause.code` is `"ERR_STRUCTURED_VALUE"` for an object or an array, because
its values could be in other documents. Step into it instead.

To count an array's items without following them, give `jrefArrayIter`
`reference: "manual"`:

```typescript
let length = 0;
for await (const item of jrefArrayIter(session, films, { reference: "manual" })) {
  length++;
}
```

The iterators are async iterators from `@hyperjump/pact`, not generators.
For more information, see [Read values](read-values.md), which also has the
new ways to walk a document and select values in it.

## Media types are in the session's configuration

v1's media type plugins were global. In v2, a Hyperjump session's
`mediaTypes` is the list of plugins it uses, so different sessions can use
different ones:

| v1 | v2 |
| --- | --- |
| `addMediaTypePlugin(contentType, plugin)` | `mediaTypes: [...defaultMediaTypes, plugin]` |
| `removeMediaTypePlugin(contentType)` | Leave the plugin out of `mediaTypes` |
| `setMediaTypeQuality(contentType, quality)` | `{ ...jsonMediaType, quality: 0.5 }` in `mediaTypes` |
| `acceptableMediaTypes()` | None. `browse` sends the `Accept` header. |
| `getFileMediaType(path)` | None. A plugin's `extensions` say which files it parses. |

A plugin is different too. It has its `mediaType` in it and its file
`extensions` where v1 had a `fileMatcher`. Its `parse` returns a document
whose root is a JSON AST node, where v1's returned `baseUri`, `root`, and
`anchorLocation`. A document says what its fragments identify with its
`anchors`. For more information, see [Media types](media-types.md).

## Schemes are in the transport

v1's URI scheme plugins were global, and each one retrieved a URL. In v2, a
transport at the bottom of the session's stack has a fetcher for each scheme.
Give `defaultTransport` the fetchers for more schemes:

```typescript
// v1
addUriSchemePlugin("urn", { retrieve: retrieveUrn });

// v2
const session = new Hyperjump({
  stack: defaultTransport({ "urn:": fetcher(fetchUrn) })
});
```

A fetcher takes a `Request` and returns a `Response`, the way `fetch` does.
`retrieve` is `session.fetch`. To leave a scheme out, give `new
SchemeTransport(schemes)` only the schemes you want. For more information,
see [Transports](transports.md).

## Errors have codes

v1's error classes are gone. A request that fails rejects with a `TypeError`,
the way `fetch` does for a network error. Every error has a `cause.code` that
says what failed, and the URL that failed as its `url`:

| v1 | v2 |
| --- | --- |
| `RetrievalError` | The error `browse` rejects with, which has the `url` |
| `HttpError` | An `Error` whose `cause.code` is `"ERR_HTTP_STATUS"`, with the `cause.status` |
| `UnsupportedMediaTypeError` and `UnknownMediaTypeError` | An `Error` whose `cause.code` is `"ERR_UNSUPPORTED_MEDIA_TYPE"` |
| `UnsupportedUriSchemeError` | A network error whose `cause.code` is `"ERR_UNKNOWN_URL_SCHEME"` |

For more information, see [Errors](errors.md) and
[Browse to a URL](browse-to-a-url.md#errors).

## JRef parses to a tree

`@hyperjump/browser/jref` is gone. v1's `parse` and `stringify` worked like
`JSON.parse` and `JSON.stringify`, with references as `Reference` objects.
In v2, `fromJref` parses JRef into a document whose root is a JSON AST, with
a position for every value. A reference is a node whose `type` is
`"reference"`, and its `href` is resolved against the document's URL. To
stringify a tree, use `jrefStringify` in a [unified](https://unifiedjs.com/)
pipeline. For more information, see [Parse JSON and JRef](parsing.md).

`fromJref` never throws. It returns the syntax errors it found next to the
document, and the document's `status` says how parsing went.

## What's new

- Requests go through a stack of layers, like an
  [HTTP cache](http-caching.md) and a [scheduler](priorities.md), that you
  build and add to. For more information, see [Layers](layers.md).
- [Selectors and walks](read-values.md#walk-a-document) find values in a
  document and follow only the references they need.
- [Registries](registries.md) answer documents your app already has.
- [Headers](hyperjump-sessions.md#headers) go only to the URLs they're for,
  such as credentials for one API.
- [Tracing](tracing.md) shows what a session fetched, and why.
- JSON is built in, beside JRef.
