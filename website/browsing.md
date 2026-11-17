# Browse documents

Browsing is reading a value and the values under it. `get` gives you a target
for the value a URL identifies, and from there the `jref` functions step into,
visit, find, and select the values under it. They take the session so they can follow
the references they reach.

```typescript
import { Hyperjump, get } from "@hyperjump/browser";

const session = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});
const luke = await get(session, "https://swapi.hyperjump.io/api/people/1");
```

## Targets

A target is what a URL identifies: a value's node and the document that the
node is in. A reference only means something in the document it's in, so the
`jref` functions take a target, which says where to follow references from,
and they give you targets back.

```typescript
luke.node; // The node for Luke
luke.document.url; // "https://swapi.hyperjump.io/api/people/1"
```

A target's `node` is a JRef abstract syntax tree (AST) node for the value. Its
`jsonType` is the kind of JSON value it holds, such as `"object"`. Its
`location` is the URL that identifies the value. The URL's fragment is a JSON
Pointer to where the value is in its document.

```typescript
luke.node.jsonType; // "object"
luke.node.location; // "https://swapi.hyperjump.io/api/people/1#"
```

A string, number, boolean, or null node has its value as plain JavaScript in
`value`, like a literal in any [unist](https://github.com/syntax-tree/unist)
tree. An object or an array node doesn't have one. You step into it instead.

## Follow references

Following a reference can mean retrieving a document, so the `jref` functions
are asynchronous and take the session. One way to step into a target is with
a selector, which [Select values](#select-values) covers in full. This one
steps from Luke to his homeworld and then to its name:

```typescript
import { jrefSelect } from "@hyperjump/browser";

const name = await jrefSelect(
  session,
  "> [key=homeworld] > [key=name][jsonType=string]",
  luke
);
name?.node.value; // "Tatooine"
name?.document.url; // "https://swapi.hyperjump.io/api/planets/1"
```

The name is in another document than Luke, and its target says which one.

None of the `jref` functions give you a reference. Each one follows any
reference it reaches and gives you the referenced value instead. If that value
is another reference, the function follows that one too.

To read the tree as it's written, pass `reference: "manual"`. The `jref`
function then gives you a reference as a target without following it. For more
information, see
[Follow references yourself](references.md#read-the-tree-as-its-written). If you
pass a target whose node is a reference to a `jref` function, it starts from
the value the reference leads to. Without `reference: "manual"`, the node of a
target from `get` or a `jref` function is never a reference.

A reference can lead to a document in any of the session's media types. So in
TypeScript, the node of a target from `get` or a `jref` function is a node of
any of them. A session with the default media types gives JRef and JSON nodes.
If you add a
media type with nodes of its own, check a node's `type` to tell which media
type it's from.
For more information, see [Media types](media-types.md).

## Step one level at a time

`jrefStep` gives you the member of a target at a key, which is a property name
or an array index. Like a selector, it follows a reference to get there:

```typescript
import { jrefStep, jrefValue } from "@hyperjump/browser";

const homeworld = await jrefStep(session, "homeworld", luke);
const name = await jrefStep(session, "name", homeworld);
jrefValue(name); // "Tatooine"
```

`jrefValue` gives you the value of a string, number, boolean, or null as plain
JavaScript. It throws an error whose `cause.code` is `"ERR_STRUCTURED_VALUE"`
for an object or an array, because their values could be in other documents.
Step into those instead.

`jrefArrayIter`, `jrefObjectValues`, and `jrefObjectEntries` are async
iterators over the members of an array or an object. The session follows each
member when the loop reaches it, so a loop that stops early retrieves less:

```typescript
import { jrefArrayIter, jrefObjectEntries } from "@hyperjump/browser";

const films = await jrefStep(session, "films", luke);
for await (const film of jrefArrayIter(session, films)) {
  console.log(jrefValue(await jrefStep(session, "title", film)));
}

for await (const [key, value] of jrefObjectEntries(session, luke)) {
  console.log(key, value.node.jsonType);
}
```

`jrefObjectKeys` gives you an object's property names and `jrefObjectHas` says
whether it has one. Neither takes the session, because reading a name doesn't
follow anything.

Use these functions when your code decides what to step into and builds a
result from what comes back, like a function that turns a document into
something else one property at a time. To reach a value by a path, a selector
is shorter. To do something at every value, use `jrefVisit`.

## Visit every value

`jrefVisit` walks a target and every value under it depth first in document
order, following references along the way. It works like `visit` from
`unist-util-visit`, and its visitor returns the same `CONTINUE`, `SKIP`, and
`EXIT` values. The visitor gets each value's target with the key it's at, the
target that has it, and its depth below the target you started from:

```typescript
import { CONTINUE, jrefVisit, SKIP } from "@hyperjump/browser";

await jrefVisit(session, luke, (target, key, parent, depth) => {
  console.log(depth, key, target.node.location);
  return key === "films" ? SKIP : CONTINUE;
});
```

The session follows a reference just before the visitor gets its value, so
returning `SKIP` keeps the session from retrieving the documents under that
value. That's also how you stop at a depth: return `SKIP` when `depth` is as
deep as you want to go. If a reference leads back to a value that the walk is
inside, like a recursive definition, the visitor gets that value but not the
values inside it again, so the walk ends.

To visit only some values, put a test before the visitor like you would with
`unist-util-visit`. A string matches a node's `type`, an object matches nodes
with the same properties, a function gets the target and matches the ones it
returns `true` for, and an array matches what any test in it matches. In
TypeScript, the node of the visitor's target has the type of the nodes that
match. This example prints every number, including the ones in the documents
that Luke's references lead to:

```typescript
await jrefVisit(session, luke, { jsonType: "number" }, ({ node }, key) => {
  console.log(key, node.value);
});
```

The walk still goes through the values that don't match and follows their
references to find what's under them.

## Find values

`jrefFind` gives you the first value under a target that passes a test, or
`undefined` if none does. `jrefFindAll` gives you every value that passes. They
take the same tests as `jrefVisit` and look in the same order it visits, so
they follow references along the way. This finds Luke's first number and every
string in the documents that his references lead to:

```typescript
import { jrefFind, jrefFindAll } from "@hyperjump/browser";

const number = await jrefFind(session, luke, { jsonType: "number" });
const strings = await jrefFindAll(session, luke, { jsonType: "string" });
```

`jrefFind` stops at the first value that passes, so the session doesn't
retrieve anything after it. `jrefFindAll` looks everywhere under the target,
and it gives you each value once even if more than one reference leads to it.
In TypeScript, the node of what they find has the type of the values that can
pass the test, so `number?.node.value` is a `number`.

## Select values

`jrefSelect` and `jrefSelectAll` find values with a selector like `select` and
`selectAll` from `unist-util-select` do, following references along the way.
`jrefSelect` gives you the first value that matches, or `undefined` if none
does. `jrefSelectAll` gives you all of them in the order it reaches them.

```typescript
import { jrefSelect, jrefSelectAll } from "@hyperjump/browser";

const film = await get(session, "https://swapi.hyperjump.io/api/films/1");

const director = await jrefSelect(session, "> [key=director]", film);
const names = await jrefSelectAll(
  session,
  "> [key=characters] > * > [key=name]",
  film
);
```

Each character is a reference to another document. The second selector steps
into each one and gets its name.

| Selector | Matches |
| --- | --- |
| `[key=name]` | The value of the property `name`, or the item at index `name` of an array, such as `[key=0]` |
| `[property=value]` | A value whose property has that value, such as `[jsonType=object]`. They're compared as text, so `[value=42]` matches `42` and `"42"`. |
| `[value]` | A value that has the property. Strings, numbers, booleans, and null have a `value`. |
| `json` or `*` | A value whose `type` is `json`, or any value |
| `:root` or `:scope` | The value you start from |
| `a b` | A `b` anywhere under an `a` |
| `a > b` | A `b` directly in an `a` |
| `> b` | A `b` directly in the value you start from |
| `a, b` | An `a` or a `b` |

Quote a value that has characters other than letters, digits, `_`, `-`, and
`$`, such as `[key="first name"]`. A selector that isn't one of these, such as
`:has()` or `a + b`, throws a `SyntaxError` that says what's supported.

TypeScript knows what kind of value a selector selects from a
`[jsonType=...]` in its last part, after its last `>` or space.
`> [key=director][jsonType=string]` gives you a target with a string node, so
its `value` is a `string`. Without one, check a node's `jsonType` before you
read its `value`.

```typescript
const director = await jrefSelect(
  session,
  "> [key=director][jsonType=string]",
  film
);
director?.node.value; // "George Lucas"
```

The session only follows a reference if the selector could match the value it
leads to or something inside it. `> [key=director]` doesn't retrieve any
characters because none of them can be the film's `director`, and `jrefSelect`
stops at the first match. A selector without `>` like `[key=name]` can match
at any depth, so it follows every reference under the value you start from. On
an API like this one that could be the whole API, so start a selector with `>`
unless you mean to search everything.

A selector follows the references it reaches one at a time. To load the
documents it needs in parallel, see
[Load references in parallel](references.md#load-references-in-parallel).

## How deep a walk goes

`jrefVisit`, `jrefFind`, `jrefFindAll`, `jrefSelect`, and `jrefSelectAll` can't
go more than 1000 levels below the value you start from. If one would, it
throws an error whose `cause.code` is `"ERR_MAX_DEPTH"`, so references that lead
to new documents without end, like a `next` link on every page of results,
can't keep it going.
The error's `url` is the value it would go inside. If you expect a walk to go
that deep, pass a bigger `maxDepth` or `Infinity` as the last argument:

```typescript
await jrefVisit(session, target, visitor, { maxDepth: 2000 });
```

It's only an error if the walk would actually go deeper. A value at the limit is
fine if the walk skips it, it has nothing inside it, or nothing inside it can
match.

The limit is a safeguard, so to stop at a depth on purpose, say so in the walk.
A visitor returns `SKIP` at the `depth` it gets as its fourth argument:

```typescript
await jrefVisit(session, firstPage, (target, key, parent, depth) => {
  // The first page and the next two
  return depth === 2 ? SKIP : CONTINUE;
});
```

A selector made of `>` steps only goes as deep as it's written, like
`> [key=next] > [key=next]` for the next two pages.

## Functions

Each `target` can also be a document, which starts at its root.

| Function | Description |
| --- | --- |
| `jrefStep(session, key, target, options)` | The member at a property name or an array index |
| `jrefValue(target)` | The value of a string, number, boolean, or null as JavaScript |
| `jrefArrayIter(session, target, options)` | The items of an array, as an async iterator |
| `jrefObjectValues(session, target, options)` | The values of an object's properties, as an async iterator |
| `jrefObjectEntries(session, target, options)` | An object's property names and values, as an async iterator |
| `jrefObjectKeys(target)` | An object's property names |
| `jrefObjectHas(key, target)` | Whether an object has a property |
| `jrefVisit(session, target, test, visitor, options)` | Visits the target and every value under it. The `test` is optional. |
| `jrefFind(session, target, test, options)` | The first value that passes the test, or `undefined` |
| `jrefFindAll(session, target, test, options)` | Every value that passes the test |
| `jrefSelect(session, selector, target, options)` | The first value that matches the selector, or `undefined` |
| `jrefSelectAll(session, selector, target, options)` | Every value that matches the selector |

| Option | Description |
| --- | --- |
| `reference` | `"follow"`, the default, follows references. `"manual"` reads the tree as it's written. For more information, see
[Follow references yourself](references.md#read-the-tree-as-its-written). |
| `maxDepth` | How many levels below the target a walk can go. The default is 1000. Only `jrefVisit`, `jrefFind`, `jrefFindAll`, `jrefSelect`, and `jrefSelectAll` take it. For more information, see [How deep a walk goes](#how-deep-a-walk-goes). |

When these functions follow a reference, they throw what `get` throws. For
more information, see [Get documents](documents.md#errors). For the errors of
their own, see [Errors](errors.md#other-errors).
