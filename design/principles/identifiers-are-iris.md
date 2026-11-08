# Identifiers are IRIs

Every identifier the session and its plugins work with is an IRI: the URI
an application passes to `get`, a reference in a document, a response's
URL, and the keys of the cache. A URL that comes from somewhere else, like
`pathToFileURL`, `fetch`'s `response.url`, or the working directory, is
made an IRI where it comes in, with `@hyperjump/uri`'s `urlToIri`, so the
rest of the code has only one kind of identifier. `@hyperjump/uri` checks,
resolves, and normalizes them.

- An IRI keeps the Unicode characters it was written with, so the
  identifiers in messages, locations, and keys read the way the document
  wrote them.
- What's given to an API that takes a URL, like `fetch` or
  `fileURLToPath`, is an IRI. Those APIs encode it themselves.
  `allowRetrieval` compares URLs inside `allowed-urls.js`, because `new
  URL` is what makes them comparable (see
  [What can be retrieved](../components/allow-retrieval.md)).
- A media type plugin checks that each reference is an IRI-reference
  before it's resolved, because a document isn't trusted (see
  [Documents aren't trusted](documents-arent-trusted.md)).
- What a scheme's identifiers mean, and whether they can be retrieved, is
  its URI scheme plugin's. An identifier like a `urn:` is an IRI even
  though it isn't a URL.

Where a value comes from decides its type, not whether a function is
public:

- A value from outside Browser is a `string`, and it's checked once, where
  it comes in: the URI given to `get` and `getDocument`, `referencedFrom`,
  the document URI given to `fromJson` and `fromJref`, a reference in a
  document, and a redirect's `Location`. One that isn't valid throws
  `@hyperjump/uri`'s error. A `Location` fails the retrieval, with the
  error as its cause, and a reference is a syntax error, because parsing
  never fails (see [Parsing never fails](parsing-never-fails.md)).
- A value Browser hands out is branded, like `Iri` or `AbsoluteIri`, and
  isn't checked again: a document's `uri`, a node's `location` and
  `href`, a response's `url` for a media type plugin, and an error's
  `uri`. So an application passes them back, like to `relativeFileUri`,
  without importing `@hyperjump/uri`.
- Inside Browser, everything is branded.

Rejected:

- WHATWG URLs (`new URL`). A URL is normalized and encoded when it's
  parsed, so an identifier isn't kept as it's written, and an application
  that looks for it in a `getDocument` override can't find it. And not
  every IRI is a URL.
- URIs. Unicode characters are percent-encoded, so a reference written
  with them reads differently in messages than in the document, and it
  would have to be converted each time it's compared with one that's
  written as an IRI.
- Converting where a URL is used instead of where it comes in. Every
  function would have to know which kind it was given.
- Branded types for every public function, with applications checking
  what they pass. Every application would check before every call, and
  depend on `@hyperjump/uri` for it.
- A public function that checks every time, even for what Browser handed
  out. The types inside Browser would be `string`, and wouldn't say what's
  true.
