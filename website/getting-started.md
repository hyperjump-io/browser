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

Retrieving happens through a session, which is a `Hyperjump` instance. Start by
creating one with a list of what it may retrieve. A document can refer to
anything anywhere, so a session doesn't retrieve anything from the network until
you say where it may go. This one can only access the Star Wars API:

```typescript
import { Hyperjump, get, jrefSelect, jrefSelectAll } from "@hyperjump/browser";

const session = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});
```

Use the session to get the first film:

```typescript
const aNewHope = await get(
  session,
  "https://swapi.hyperjump.io/api/films/1"
);
```

`get` returns a target for the value that URL identifies. A target has the
value's `node`, which is a JRef abstract syntax tree (AST) node, and the
`document` that the node is in. The tree is a
[unist](https://github.com/syntax-tree/unist) tree, and you find values in it
with selectors, like you'd find elements in a web page with CSS. `jrefSelect`
takes the session so it can follow references, and it returns a target for the
first value that matches. A selector that starts with `>` matches what's
directly inside the target you give it, and `[key=title]` matches the value of
the `title` property. A node's `jsonType` is the kind of JSON value it holds, so
`[jsonType=string]` says the title is a string. A string, number, boolean, or
null node has its value as plain JavaScript in `value`:

```typescript
const title = await jrefSelect(
  session,
  "> [key=title][jsonType=string]",
  aNewHope
);
title?.node.value; // "A New Hope"
```

`jrefSelect` returns `undefined` if nothing matches, like when the film doesn't
have a title or its title isn't a string. TypeScript knows from the selector that
the node of a target it returns is a string node.

The film's `characters` property is where the references come in. Each `>` in a
selector steps one level deeper, and `*` matches any value. `jrefSelectAll`
returns a target for every value that matches, so this selector finds the name
of every character in the film:

```typescript
const names = await jrefSelectAll(
  session,
  "> [key=characters] > * > [key=name][jsonType=string]",
  aNewHope
);

for (const name of names) {
  console.log(name.node.value);
}
```

```text
Luke Skywalker
C-3PO
R2-D2
...
```

Notice that the selector never mentions a `$ref` or a URL. The session followed
each reference in `characters` for you and retrieved each character's document.
It only follows references a selector could match in, so it doesn't retrieve
what the film's other properties refer to.

The session also keeps every document it retrieves. If another film refers to
Luke, the session uses the copy of his document it already has instead of
retrieving it again. That gives you a consistent view of the API for as long as
you use the session. Create a new session when you want to see changes. For
more information, see
[Get documents](documents.md#a-session-keeps-its-documents).

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
const session = new Hyperjump();

const luke = await get(session, "./api/people/1.jref");
const name = await jrefSelect(
  session,
  "> [key=homeworld] > [key=name][jsonType=string]",
  luke
);
name?.node.value; // "Tatooine"
```

Everything after `get` is the same code you used for the API. Keep in mind that
`./api/people/1.jref` isn't a path, it's a URL. That means the string you pass
to `get` is the same regardless of what operating system you're using. A
Windows path such as `C:\api\people\1.jref` doesn't work, not even on Windows,
because a URL reads `C:` as a scheme.

## What's next

- [Browse documents](browsing.md) for every way to read a target
- [What a session can fetch](allow-retrieval.md) before you use documents you
  don't control
- [Sessions](sessions.md) for a session's options, and the stack it retrieves
  through
