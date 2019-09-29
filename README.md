# Hyperjump Browser

The Hyperjump browser is an experimental generic hypermedia client. It aims to
provide a uniform interface for working with hypermedia enabled media types.
When you use a web browser, you don't interact with HTML, you interact with the
UI that the HTML represents. The Hyperjump browser aims to do the same except
with data. It abstracts away the hypermedia so you can work data as if it's just
plain JSON data without having to leave the browser.

The Hyperjump browser allows you to plug in support for different media types,
but it comes with support for and was initially designed for [JSON Reference][jref]
(JRef). The Hyperjump browser also has support for JSON, but you won't get
support for the interesting things the browser supports.

## Installation

```bash
npm install @hyperjump/browser --save
```

## Contributing

### Tests

Run the tests

```bash
npm test
```

Run the tests with a continuous test runner

```bash
npm test -- --watch
```

## Bundlers

When using with the [Rollup][rollup] bundler, you will need to include the
`browser: true` config option.

```
  plugins: [
    resolve({
      browser: true
    }),
    commonjs()
  ]
```

## Usage

The following is short demo. See the [API](#api) section below to see all of the
things you can do.

This example uses the API at https://swapi.hyperjump.io. It's a variation of the
[Star Wars API (SWAPI)](https://www.swapi.co) implemented using the [JRef][jref]
media type.

[Hyperjump Pact][pact] is used to apply standard higher-order functions that
work with promises.

```javascript
const Hyperjump = require("@hyperjump/browser");
const Pact = require("@hyperjump/pact");


const characterHomeworlds = Pact.pipeline([
  Pact.map(async (character) => {
    const name = await character.name;
    const homeworld = await character.homeworld.name;

    return `${name} is from ${homeworld}`;
  }),
  Pact.all
]);

const ladies = Pact.pipeline([
  Pact.filter(async (character) => (await character.gender) === "female"),
  Pact.map((character) => character.name),
  Pact.all
]);

const mass = Pact.reduce(async (acc, character) => {
  return acc + (parseInt(await character.mass, 10) || 0);
}, 0);

(async function () {
  const film = Hyperjump.fetch("https://swapi.hyperjump.io/api/films/1");

  await film.title; // --> A New Hope
  await characterHomeworlds(film.characters); // --> [ 'Luke Skywalker is from Tatooine',
                                              // -->   'C-3PO is from Tatooine',
                                              // -->   'R2-D2 is from Naboo',
                                              // -->   ... ]
  await ladies(film.characters); // --> [ 'Leia Organa', 'Beru Whitesun lars' ]
  await mass(film.characters); // --> 1290
}());
```

Except for all the promises, this looks exactly like it might if you were
working with a normal in-memory data structure.

## API

### nil
`Document`

The nil document. This is like the blank page you see when you first open your
browser.

### get
`(Url, Document|Promise<Document>, Options?) => Promise<Document>`

Retrieve a document with respect to a context document. Options can be passed to
set custom headers. If the value of the document is a link, it will be followed.

### fetch
`(Url, Options?) => Hyperjump`

Retrieve a document. Options can be passed to set custom headers. If the value
of the document is a link, it will be followed.

### value
`(Document|any) => any`

The value of a document.

### source
`(Document) => string`

The raw source of a document.

### step
`(string, Document|Promise<Document>, Options) => Promise<Document|any>`

Step into a document using the key given.

### construct
`(Url, Headers, string) => Document`

Construct a document given a URL, headers, and body. For internal use.

### extend
`(Document, Object) => Document`

Modify or add fields to a document. For internal use.

### addContentType
`(string, ContentTypeHandler) => void`

Add support for a new content type. The `ContentTypeHandler` is an object with
three functions: `get`, `value`, and `step`.

[jref]: https://github.com/hyperjump-io/browser/blob/master/lib/json-reference/README.md
[pact]: https://github.com/hyperjump-io/hyperjump-pact
[rollup]: https://rollupjs.org
