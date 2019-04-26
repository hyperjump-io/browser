Hyperjump Browser
=================

The Hyperjump browser is an experimental generic hypermedia client. It aims to
provide a uniform interface for working with hypermedia enabled media types.
When you use a web browser, you don't interact with HTML, you interact with the
UI that the HTML represents. The Hyperjump browser aims to do the same except
with data. It abstracts away the hypermedia so you can work data as if it's just
plain JSON data without having to leave the browser.

The Hyperjump browser allows you to plug in support for different media types,
but it comes with support for and was initially designed for
[JSON Reference (JRef)](https://github.com/jdesrosiers/hyperjump-browser/tree/master/json-reference).
This media type is based on the
[JSON Reference I-D](https://tools.ietf.org/html/draft-pbryan-zyp-json-ref-03)
with some additions and improvements. The Hyperjump browser also has support for
JSON, but you won't get support for the interesting things the browser supports.

Installation
------------

```bash
npm install @hyperjump/browser --save
```

Contributing
------------

### Tests

Run the tests

```bash
npm test
```

Run the tests with a continuous test runner

```bash
npm test -- --watch
```

Usage
-----

The following is short demo. See the
[API](https://github.com/jdesrosiers/hyperjump-browser/tree/master/json-reference)
section below to see all of the things you can do.

This example uses a variation of the
[Star Wars API (SWAPI)](https://www.swapi.co) implemented using the
[JRef](https://github.com/jdesrosiers/hyperjump-browser/tree/master/json-reference)
media type.

```javascript
const Hyperjump = require("@hyperjump/browser");


const Film = {
  title: Hyperjump.pipeline([Hyperjump.get("#/title"), Hyperjump.value]),
  characters: Hyperjump.get("#/characters")
};

const Character = {
  name: Hyperjump.pipeline([Hyperjump.get("#/name"), Hyperjump.value]),
  mass: Hyperjump.pipeline([Hyperjump.get("#/mass"), Hyperjump.value]),
  gender: Hyperjump.pipeline([Hyperjump.get("#/gender"), Hyperjump.value]),
  homeworld: Hyperjump.get("#/homeworld")
};

const Planet = {
  name: Hyperjump.pipeline([Hyperjump.get("#/name"), Hyperjump.value])
}

const characterNames = Hyperjump.pipeline([
  Film.characters,
  Hyperjump.map(Character.name)
]);

const characterHomeworldName = Hyperjump.pipeline([
  Character.homeworld,
  Planet.name
])

const characterHomeworlds = Hyperjump.map(async (character) => {
  const name = await Character.name(character);
  const homeworld = await characterHomeworldName(character)

  return `${name} is from ${homeworld}`;
});

const ladies = Hyperjump.pipeline([
  Hyperjump.filter(async (character) => {
    const gender = await Character.gender(character);
    return gender === "female";
  }),
  Hyperjump.map(Character.name)
]);

const mass = Hyperjump.pipeline([
  Hyperjump.map(Character.mass),
  Hyperjump.reduce(async (acc, mass) => acc + (parseInt(mass, 10) || 0), 0)
]);

(async function () {
  const film = Hyperjump.get("http://swapi.hyperjump.io/api/films/1", Hyperjump.nil);
  const characters = Film.characters(film);

  await Film.title(film); // --> A New Hope
  await characterHomeworlds(characters); // --> [ 'Luke Skywalker is from Tatooine',
                                         // -->   'C-3PO is from Tatooine',
                                         // -->   'R2-D2 is from Naboo',
                                         // -->   ... ]
  await ladies(characters); // --> [ 'Leia Organa', 'Beru Whitesun lars' ]
  await mass(characters); // --> 1290
}());
```

In this example, we create functions using composition to get the data we want.
The composition approach makes this code very resilient to changes. If something
changes, you only have to change it in one function and all the functions that
compose that function just work. The downside of this approach, however, is that
it can be a bit verbose. That's why there's also the "Natural" API for the
Hyperjump browser.

```javascript
const Hyperjump = require("@hyperjump/natural");


const characterHomeworlds = Hyperjump.map(async (character) => {
  const name = await character.name;
  const homeworld = await character.homeworld.name;

  return `${name} is from ${homeworld}`;
});

const ladies = Hyperjump.pipeline([
  Hyperjump.filter(async (character) => (await character.gender) === "female"),
  Hyperjump.map((character) => character.name)
]);

const mass = Hyperjump.reduce(async (acc, character) => {
  return acc + (parseInt(await character.mass, 10) || 0);
}, 0);

(async function () {
  const film = Hyperjump.get("http://swapi.hyperjump.io/api/films/1", Hyperjump.nil);

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
working with a normal in-memory data structure. The "Natural" API is much more
concise and readable than the standard API, but has less resiliency to change
than the standard API. It also has the limitation that it is based on the
JavaScript Proxy API which is not supported everywhere yet.

API
---

### `nil`
`Document`

The nil document. This is like the blank page you see when you first open your
browser.

### `get`
`(Url, Document|Promise<Document>, Options?) => Promise<Document>`

Retrieve a document with respect to a context document. Options can be passed to
set custom headers. If the value of the document is a link, it will be followed.

### `value`
`(Document|any) => any`

The value of a document.

### `source`
`(Document) => string`

The raw source of a document.

### `entries`
`(Document|Promise<Document>|any, Options) => Promise<[string, Document|any][]>`

An array of key/value pairs from a document whose value is an Object.

### `step`
`(string, Document|Promise<Document>|any, Options) => Promise<Document|any>`

Step into a document using the key given.

### `map`
`((Document|any) => T, Document|Promise<Document>|any, Options) => Promise<T[]>`

A map function that works with promises and knows how to step into a document.

### `filter`
`((Document|any) => boolean, Document|Promise<Document>|any, Options) => Promise<(Document|any)[]>`

A filter function that works with promises and knows how to step into a
document.

### `reduce`
`((T, Document|any) => T, T, Document|Promise<Document>|any, Options) => Promise<T>`

A reduce function that works with promises and knows how to step into a
document.

### `pipeline`
`(Function[], Document|Promise<Document>|any) => Promise<any>`

Compose an array of functions that call the next function with result of the
previous function. It works with promises.

### `construct`
`(Url, Headers, string) => Document`

Construct a document given a URL, headers, and body. For internal use.

### `extend`
`(Document, Object) => Document`

Modify or add fields to a document. For internal use.

### `addContentType`
`(string, ContentTypeHandler) => void`

Add support for a new content type. The `ContentTypeHandler` is an object with
three functions: `get`, `value`, and `step`.
