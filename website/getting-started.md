# Getting started

This tutorial explores a small Star Wars API by following the links between its
documents. Once that works you'll point the same code at files on disk and find
that it works almost exactly the same way.

## JRef

The API's documents are written in
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
of duplicating them. You won't have to retrieve them yourself because a
reference is transparent like a reference in most programming languages. When
you step into one, you get the value it refers to rather than the reference.

## Browse an API

The API can be found at
[https://swapi.hyperjump.io](https://explore.hyperjump.io#https://swapi.hyperjump.io/api/films/1).
It's a version of the [Star Wars API](https://swapi.dev) rewritten in JRef.

Start by configuring a `Hyperjump` with what's allowed to be retrieved. A
document can refer to anything anywhere, so `Hyperjump` won't retrieve anything
from the network until you tell it where it may go. This one can only access the
Star Wars API:

```typescript
import { Hyperjump } from "@hyperjump/browser";

const h = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});
```

Retrieving happens through a `session`. Start one and use it to get the first
film:

```typescript
const session = h.session();
const aNewHope = await session.get(
  "https://swapi.hyperjump.io/api/films/1"
);
```

`get` returns a JRef AST node for the value identified by that URL. You reach
the film's properties by stepping into it. Once you get to a value that isn't an
object or an array, `value` hands it back as plain JavaScript:

```typescript
const title = await session.step("title", aNewHope);
session.value(title); // "A New Hope"
```

The film's `characters` property is where the references come in. Iterating over
the array follows each reference as you reach it, so every character you get
back was retrieved from its own URL:

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
reference for you and retrieved each document the first time it was needed.

The session also keeps every document it retrieves. If another film refers to
Luke, the session uses the copy of his document it already has instead of
retrieving it again. That gives you a consistent view of the API for as long as
you use the session. Start a new session when you want to see changes. See
[Sessions](browsing.md#sessions) for how sessions share the HTTP cache.

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

The default is to allow access to all files in the working directory, so no
configuration is needed:

```typescript
const session = new Hyperjump().session();

const luke = await session.get("./api/people/1.jref");
const homeworld = await session.step("homeworld", luke);
const name = await session.step("name", homeworld);
session.value(name); // "Tatooine"
```

Everything after `get` is the same code you used for the API. Keep in mind that
`./api/people/1.jref` isn't a file path, it's a URL. That means the string you
pass to `get` is the same regardless of what operating system you're using.
`.\api\people\1.jref` won't work, not even on Windows.

## Next steps

- [Browsing documents](browsing.md) for every way to read a node
- [What can be retrieved](allow-retrieval.md) before using documents you
  don't control
