# Follow references yourself

The `jref` functions follow every reference they reach, which is what you want
to read values. Some code needs the references themselves: to list what a
document refers to, to report every reference that's broken, or to follow the
references in a tree that the session didn't retrieve. These examples use this
session:

```typescript
import { Hyperjump, get } from "@hyperjump/browser";

const session = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});
const luke = await get(session, "https://swapi.hyperjump.io/api/people/1");
```

## Read the tree as it's written

Every `jref` function takes `reference: "manual"` as its last argument, like
`get` does. With it, the function doesn't follow references, so it reads the
tree as it's written and a reference is a target like any other. This finds
every reference in a document, each with the document it's in:

```typescript
import { get, jrefFindAll } from "@hyperjump/browser";

const url = "https://swapi.hyperjump.io/api/films/1";
const film = await get(session, url, { reference: "manual" });
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

Code that doesn't walk can follow a reference with `get`. Pass the reference's
target as `referencedFrom` so the session knows which document the reference
is in. That document causes the request, and `get` finds a document that it
contains without retrieving it:

```typescript
import { get, jrefStep } from "@hyperjump/browser";

const written = await jrefStep(session, "homeworld", luke, {
  reference: "manual"
});
const homeworld = written.node.type === "reference"
  ? await get(session, written.node.href, { referencedFrom: written })
  : written;
```

## Carry on past a reference that fails

A walk that can't follow a reference throws what `get` throws, such as a network
error or an `ERR_HTTP_STATUS` error. To report every broken reference instead of
stopping at the first, find the references as they're written, and follow each
one with `get`:

```typescript
import { get, jrefFindAll } from "@hyperjump/browser";

const references = await jrefFindAll(session, film, "reference", {
  reference: "manual"
});

for (const reference of references) {
  try {
    await get(session, reference.node.href, { referencedFrom: reference });
  } catch (error) {
    console.log(`${reference.node.location}: ${(error as Error).message}`);
  }
}
```

Each reference has the document that it's in, so the session knows which
document causes the request.

## Browse a tree you parsed

A document that you parsed yourself isn't one the session retrieved, so `get`
never gave you a target for it. The `jref` functions take the document where
they take a target and browse from its root, the way a unist utility takes the
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
  get,
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
      await get(session, href, { referencedFrom: tree });
    }
  };
```

A tree can have any parse status. The `jref` functions browse what a tree whose
parse failed has: they leave out a value that's missing, and a value that
couldn't be parsed is a `json-invalid` node.

The `jref` functions don't take a node on its own, because a node doesn't say
which document it's in. To browse from a value inside a tree, start at the
tree and step or select to the value.
