# Follow references yourself

The `jref` functions follow every reference they reach, which is what you want
to read values. Some code needs the references themselves: to list what a
document refers to, to report every reference that's broken, or to follow the
references in a tree that the Hyperjump session didn't retrieve. These examples
use this session:

```typescript
import { Hyperjump, browse } from "@hyperjump/browser";

const session = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});
const luke = await browse(session, "https://swapi.hyperjump.io/api/people/1");
```

## Read the tree as it's written

Every `jref` function takes `reference: "manual"` as its last argument, like
`browse` does. With it, the function doesn't follow references, so it reads the
tree as it's written and a reference is a target like any other. This finds
every reference in a document, each with the document it's in:

```typescript
import { browse, jrefFindAll } from "@hyperjump/browser";

const url = "https://swapi.hyperjump.io/api/films/1";
const film = await browse(session, url, { reference: "manual" });
const references = await jrefFindAll(session, film, "reference", {
  reference: "manual"
});

for (const reference of references) {
  console.log(reference.node.href);
}
```

`jrefStep` and the iterators take it too, so
`jrefStep(session, "homeworld", luke, { reference: "manual" })` is the
reference to Luke's homeworld and not the homeworld.

Documents are also [unist](https://github.com/syntax-tree/unist) trees, so the
unified ecosystem's utilities and the `json` functions work on a target's
`document` and `node`. They read a tree as it's written and give you nodes. For
more information, see [Parse JSON and JRef](parsing.md).

## Follow a reference

A walk that starts at a reference starts at the value it leads to. The
selector `:scope` matches only where a walk starts, so it follows a reference
and gives you the value it leads to. For any other target, it gives you the
target unchanged:

```typescript
import { jrefSelect, jrefStep } from "@hyperjump/browser";

const written = await jrefStep(session, "homeworld", luke, {
  reference: "manual"
});
const homeworld = await jrefSelect(session, ":scope", written);
```

Code that doesn't walk can follow a reference with `browse`. Pass the reference's
target as `referencedFrom` so the session knows which document the reference
is in. That document causes the request, and `browse` finds a document that it
contains without retrieving it:

```typescript
import { browse, jrefStep } from "@hyperjump/browser";

const written = await jrefStep(session, "homeworld", luke, {
  reference: "manual"
});
const homeworld = written.node.type === "reference"
  ? await browse(session, written.node.href, { referencedFrom: written })
  : written;
```

## Load references in parallel

The `jref` functions follow each reference when they reach it, and wait for it
before they go on. That's what lets a walk that stops early, or a selector that
can't match under a value, skip retrieving the rest. It also means the documents
that a walk reaches load one after another. To load them all at once, find the
references as they're written, follow them together with `browse`, and then walk:

```typescript
import { browse, jrefSelectAll } from "@hyperjump/browser";

const film = await browse(session, "https://swapi.hyperjump.io/api/films/1");

const characters = await jrefSelectAll(
  session,
  "> [key=characters] > *",
  film,
  { reference: "manual" }
);
await Promise.all(characters.map((character) =>
  character.node.type === "reference"
    ? browse(session, character.node.href, { referencedFrom: character })
    : character
));

const names = await jrefSelectAll(
  session,
  "> [key=characters] > * > [key=name]",
  film
);
```

The session keeps every document it retrieves, so the walk finds each
character's document without retrieving it again. For more information, see
[Browse to a URL](browse-to-a-url.md#a-session-keeps-its-documents). In Node.js, the
default stack limits how many requests go to a server at once, so some of them
wait for a slot:

```text
  # url                                          source           stat  0ms                                833ms
  1 swapi.hyperjump.io/api/films/1               network          200  |█████████████████████                   |
  2 ↳ swapi.hyperjump.io/api/people/1            network          200  |                     ██████             |
  3 ↳ swapi.hyperjump.io/api/people/2            network          200  |                     ██████             |
  4 ↳ swapi.hyperjump.io/api/people/3            network          200  |                     ██████             |
  5 ↳ swapi.hyperjump.io/api/people/4            network          200  |                     █████              |
  6 ↳ swapi.hyperjump.io/api/people/5            network          200  |                     ██████             |
  7 ↳ swapi.hyperjump.io/api/people/6            network          200  |                     ██████             |
  8 ↳ swapi.hyperjump.io/api/people/7            network          200  |                     ░░░░████████████   |
  9 ↳ swapi.hyperjump.io/api/people/8            network          200  |                     ░░░░░███████████   |
...
```

With the 18 characters of this film, the walk on its own took about two
seconds, and loading them first took under one. For more information about
limits and waiting, see [Priorities](priorities.md).

Loading ahead of a walk retrieves everything you find, even what the walk
wouldn't have reached. Find only the references that you know the walk needs.

## Carry on past a reference that fails

A walk that can't follow a reference throws what `browse` throws, such as a network
error or an `ERR_HTTP_STATUS` error. To report every broken reference instead of
stopping at the first, find the references as they're written, and follow each
one with `browse`:

```typescript
import { browse, jrefFindAll } from "@hyperjump/browser";

const references = await jrefFindAll(session, film, "reference", {
  reference: "manual"
});

for (const reference of references) {
  try {
    await browse(session, reference.node.href, { referencedFrom: reference });
  } catch (error) {
    console.log(`${reference.node.location}: ${(error as Error).message}`);
  }
}
```

Each reference has the document that it's in, so the session knows which
document causes the request.

## Read a tree you parsed

A document that you parsed yourself isn't one the session retrieved, so `browse`
never gave you a target for it. The `jref` functions take the document where
they take a target and start from its root, the way a unist utility takes the
tree. A reference in the document finds the document itself and the documents
that it contains, without retrieving them:

```typescript
import { jrefMediaType, jrefSelect } from "@hyperjump/browser";

const mine = await jrefMediaType.parse({
  text: async () => `{ "luke": { "$ref": "/api/people/1" } }`,
  url: "https://swapi.hyperjump.io/mine"
});
const luke = await jrefSelect(session, "> [key=luke]", mine);
```

A reference that the session retrieves comes from the document's URL, so only
a document whose URL is a `file:` URL can refer to a file. For more
information, see [Documents from the web](file-urls.md#documents-from-the-web).

The tree in a [unified pipeline](parsing.md#in-a-unified-pipeline) is a
document too. A transformer reads it as it's written with the ecosystem's
utilities, which give it nodes. To follow a reference that one of them finds,
pass the tree as `referencedFrom`:

```typescript
import {
  browse,
  type Hyperjump,
  type JrefDocumentNode
} from "@hyperjump/browser";
import { visit } from "unist-util-visit";

const followReferences = (session: Hyperjump) =>
  async (tree: JrefDocumentNode) => {
    const hrefs: string[] = [];
    visit(tree, "reference", (reference) => {
      hrefs.push(reference.href);
    });

    for (const href of hrefs) {
      await browse(session, href, { referencedFrom: tree });
    }
  };
```

A tree can have any parse status. The `jref` functions read what a tree whose
parse failed has: they leave out a value that's missing, and a value that
the parser couldn't parse is a `json-invalid` node.

The `jref` functions don't take a node on its own, because a node doesn't say
which document it's in. To read a value inside a tree, start at the
tree and step or select to the value.
