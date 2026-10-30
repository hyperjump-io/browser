# Getting started

This tutorial browses a small API whose documents link to each other. Then
it does the same with files.

## JRef

The documents are [JRef](../src/jref/README.md): JSON, where an object with
a `$ref` string is a reference to another value, by URI.

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

A reference is like a pointer in a programming language. When you step
into one, you get the value it refers to, not the reference.

## Browse an API

The API at [https://swapi.hyperjump.io](https://explore.hyperjump.io#https://swapi.hyperjump.io/api/films/1)
is a version of the [Star Wars API](https://swapi.dev) written in JRef.

Create a `Hyperjump`. It holds the configuration, such as what can be
retrieved. By default nothing on the network can be retrieved, so allow
the API.

```typescript
import { Hyperjump } from "@hyperjump/browser";

const h = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});
```

Documents are retrieved through a session. Start one and get the first
film:

```typescript
const session = h.session();
const aNewHope = await session.get(
  "https://swapi.hyperjump.io/api/films/1"
);
```

`get` returns a node, which is a value in the document. Step into it to get
its properties. `value` converts a node to a JavaScript value. It works for
anything that isn't an object or an array.

```typescript
const title = await session.step("title", aNewHope);
session.value(title); // "A New Hope"
```

`characters` is an array of references to other documents. When you
iterate over it, each reference is followed. You get each character, which
is retrieved from its own URL:

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

You never see a `$ref`. Each document is retrieved once per session, the
first time it's needed.

## Browse files

Files work the same way. A file's media type comes from its extension, and
JRef files end with `.jref`.

```jref
{
  "name": "Luke Skywalker",
  "homeworld": { "$ref": "../planets/1.jref" }
}
```

```typescript
const session = new Hyperjump().session();

const luke = await session.get("./api/people/1.jref");
const homeworld = await session.step("homeworld", luke);
const name = await session.step("name", homeworld);
session.value(name); // "Tatooine"
```

Relative paths are resolved against the working directory. By default,
only files in the working directory can be retrieved.

## Next steps

- [Browsing documents](browsing.md) for every way to read a node
- [What can be retrieved](allow-retrieval.md) before using documents you
  don't control
