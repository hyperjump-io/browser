# Get started

This tutorial explores a small Star Wars API by following the links between its
documents. After that works, you point the same code at files on disk and find
that it works almost exactly the same way.

## JRef

The API's documents are in
[JRef](https://github.com/hyperjump-io/json-reference/blob/main/spec.md). JRef
is JSON with references. Any object with a `$ref` property is a URL reference to
the value it refers to. Here's how the first film refers to its characters:

```jref
{
  "title": "A New Hope",
  "director": "George Lucas",
  "characters": [
    { "$ref": "../../people/1" },
    { "$ref": "../../people/2" }
  ]
}
```

Each character has its own document. The film refers to those documents instead
of duplicating them. You don't have to retrieve them yourself because a
reference is transparent like a reference in most programming languages. When
you step into one, you get the value it refers to rather than the reference.

## Browse an API

The API is at <https://swapi.hyperjump.io>. It's a version of the
[Star Wars API](https://swapi.dev) rewritten in JRef. You can
[browse it in the explorer](https://explore.hyperjump.io#https://swapi.hyperjump.io/api/films/1).

Start by creating a `Hyperjump` instance with a list of what it may retrieve. A
document can refer to anything anywhere, so `Hyperjump` doesn't retrieve
anything from the network until you say where it may go. This one can only
access the Star Wars API:

```typescript
import { Hyperjump } from "@hyperjump/browser";

const h = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});
```

Retrieving happens through a session. Start one and use it to get the first
film:

```typescript
const session = h.session();
const aNewHope = await session.get(
  "https://swapi.hyperjump.io/api/films/1"
);
```

`get` returns a JRef abstract syntax tree (AST) node for the value that URL
identifies. You reach the film's properties by stepping into it. When you get to
a value that isn't an object or an array, `value` returns it as plain
JavaScript:

```typescript
const title = await session.step("title", aNewHope);
session.value(title); // "A New Hope"
```

The film's `characters` property is where the references come in. Iterating over
the array follows each reference as you reach it, so the session retrieves every
character you get back from its own URL:

```typescript
const characters = await session.step("characters", aNewHope);

for await (const character of session.iter(characters)) {
  const name = await session.step("name", character);
  console.log(session.value(name));
}
```

```text
Luke Skywalker
C-3PO
R2-D2
...
```

Notice that the loop never mentions a `$ref` or a URL. The session followed each
reference for you and retrieved each document the first time the loop needed
it.

The session also keeps every document it retrieves. If another film refers to
Luke, the session uses the copy of his document it already has instead of
retrieving it again. That gives you a consistent view of the API for as long as
you use the session. Start a new session when you want to see changes. For how
sessions share the HTTP cache, see [Sessions](browsing.md#sessions).

## Browse files

Files work the same way. Their media type comes from the file extension. For
JRef the extension is `.jref`. Here's Luke again, this time as a file with a
reference to his homeworld:

```jref
{
  "name": "Luke Skywalker",
  "homeworld": { "$ref": "../planets/1.jref" }
}
```

The default for `allowRetrieval` allows all files in the working directory, so
you don't need to configure anything:

```typescript
const session = new Hyperjump().session();

const luke = await session.get("./api/people/1.jref");
const homeworld = await session.step("homeworld", luke);
const name = await session.step("name", homeworld);
session.value(name); // "Tatooine"
```

Everything after `get` is the same code you used for the API. Keep in mind that
`./api/people/1.jref` isn't a path, it's a URL. That means the string you pass
to `get` is the same regardless of what operating system you're using.
`.\api\people\1.jref` doesn't work, not even on Windows.

## What's next

- [Browse documents](browsing.md) for every way to read a node
- [What a session can retrieve](allow-retrieval.md) before you use documents
  you don't control
