# Read values

`browse` gives you a target for the value a URL identifies. The `jref` functions
take a target and read its value or step into, visit, find, and select the
values under it. They give you targets for those values, which you pass to them
in turn. They take a [Hyperjump session](hyperjump-sessions.md) so they can
follow the references they reach.

Most of the examples on this page read Luke's document from a Star Wars API.
They start from the session and the target that this code makes:

```typescript
import { Hyperjump, browse } from "@hyperjump/browser";

const session = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});
const luke = await browse(session, "https://swapi.hyperjump.io/api/people/1");
```

## Follow references

Following a reference can mean retrieving a document, so the `jref` functions
are asynchronous and take the Hyperjump session. One way to step into a target
is with a selector, which [Select values](#select-values) covers in full. This
one steps from Luke to his homeworld and then to its name. `jrefValue` gives you
the name as a string:

```typescript
import { jrefSelect, jrefValue } from "@hyperjump/browser";

const name = await jrefSelect(
  session,
  "> [key=homeworld] > [key=name]",
  luke
);
if (name) {
  await jrefValue(session, name); // "Tatooine"
}
```

Luke's homeworld is a reference to the planet's document, but the code doesn't
need to know that. A reference only means something in the document it's in,
and a target knows which document its value is in. So when a `jref` function
reaches a reference, it knows where to follow it from.

None of the `jref` functions give you a reference. Each one follows any
reference it reaches and gives you the referenced value instead. If that value
is another reference, the function follows that one too.

To read the tree as it's written, pass `reference: "manual"`. The `jref`
function then gives you a target for a reference without following it. For
more information, see
[Follow references yourself](references.md#read-the-tree-as-its-written). If you
pass a target for a reference to a `jref` function, it starts from the value
the reference leads to. Without `reference: "manual"`, a target from `browse`
or a `jref` function is never for a reference.

## Step one level at a time

`jrefStep` gives you the member of a target at a key, which is a property name
or an array index. Like a selector, it follows a reference to get there:

```typescript
import { jrefStep, jrefValue } from "@hyperjump/browser";

const homeworld = await jrefStep(session, "homeworld", luke);
const name = await jrefStep(session, "name", homeworld);
await jrefValue(session, name); // "Tatooine"
```

`jrefValue` gives you the value of a string, number, boolean, or null as plain
JavaScript. It throws an error whose `cause.code` is `"ERR_STRUCTURED_VALUE"`
for an object or an array, because their values could be in other documents.
Step into those instead. `jrefJsonType` gives you the kind of JSON value a
target is, such as `"string"` or `"object"`, so you know which to do.

`jrefArrayIter`, `jrefObjectValues`, and `jrefObjectEntries` are async iterators
over the members of an array or an object. The Hyperjump session follows each
member when the loop reaches it, so a loop that stops early retrieves less:

```typescript
import { jrefArrayIter, jrefJsonType, jrefObjectEntries } from "@hyperjump/browser";

const films = await jrefStep(session, "films", luke);
for await (const film of jrefArrayIter(session, films)) {
  console.log(await jrefValue(session, await jrefStep(session, "title", film)));
}

for await (const [key, value] of jrefObjectEntries(session, luke)) {
  const jsonType = await jrefJsonType(session, value);
  if (jsonType === "object" || jsonType === "array") {
    console.log(key, jsonType);
  } else {
    console.log(key, await jrefValue(session, value));
  }
}
```

`jrefObjectKeys` gives you an object's property names as an async iterator, and
`jrefObjectHas` says whether it has one. Neither follows the members, because
reading a name doesn't need them.

Use these functions when your code decides what to step into and builds a
result from what comes back, like a function that turns a document into
something else one property at a time. To reach a value by a path, a selector
is shorter. To do something at every value, use `jrefVisit`.

## Visit every value

`jrefVisit` walks a target and every value under it depth first in document
order, following references along the way. It works like `visit` from
`unist-util-visit`, and its visitor returns the same `CONTINUE`, `SKIP`, and
`EXIT` values.

A walk follows every reference under the target, and on the Star Wars API
everything under Luke is the whole API, because his films refer to their
characters and planets, and those refer to more. Walks are for documents whose
references don't lead that far, like this team, where people refer to each
other:

```jref title="team.jref"
{
  "lead": { "$ref": "#/people/0" },
  "people": [
    { "name": "Ada", "email": "ada@example.com" },
    {
      "name": "Grace",
      "email": "grace@example.com",
      "manager": { "$ref": "#/people/0" }
    }
  ]
}
```

The file isn't on the Star Wars API, so this Hyperjump session has the default
`allowRetrieval`, which allows the files in the working directory. The visitor
gets each value's target with the key it's at, the target that has it, and its
depth below the target you started from. This prints an outline of the team
without going into anyone's manager:

```typescript
import { CONTINUE, jrefVisit, SKIP } from "@hyperjump/browser";

const files = new Hyperjump();
const team = await browse(files, "./team.jref");
await jrefVisit(files, team, (target, key, parent, depth) => {
  console.log(`${"  ".repeat(depth)}${key ?? "team"}`);
  return key === "manager" ? SKIP : CONTINUE;
});
```

```text
team
  lead
    name
    email
  people
    0
      name
      email
    1
      name
      email
      manager
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
returns `true` for, and an array matches what any test in it matches. A
node's `jsonType` is the kind of JSON value it holds, such as `"string"`. In
TypeScript, `jrefValue` knows the type of a value that matches. This example
prints every string:

```typescript
await jrefVisit(files, team, { jsonType: "string" }, async (target, key) => {
  console.log(key, await jrefValue(files, target));
});
```

```text
name Ada
email ada@example.com
name Ada
email ada@example.com
name Grace
email grace@example.com
name Ada
email ada@example.com
```

The visitor gets Ada's name and email each time the walk reaches her, through
`lead`, `people`, and Grace's `manager`. The walk still goes through the values
that don't match and follows their references to find what's under them.

## Find values

`jrefFind` gives you the first value under a target that passes a test, or
`undefined` if none does. `jrefFindAll` gives you every value that passes. They
take the same tests as `jrefVisit` and look in the same order it visits, so
they follow references along the way. They're for searching a document when
you don't know where the values are. A function test gets each value's target
and the key it's at, so this finds every email in the team:

```typescript
import { jrefFindAll } from "@hyperjump/browser";

const emails = await jrefFindAll(files, team, (target, key) => key === "email");
for (const email of emails) {
  console.log(await jrefValue(files, email));
}
```

```text
ada@example.com
grace@example.com
```

A visit gets Ada's email three times, but `jrefFindAll` gives you each value
once. `jrefFind` stops at the first value that passes, so the Hyperjump session
doesn't retrieve anything after it. To reach values by their path, use a
selector.

In TypeScript, an object test narrows what they find, so with
`{ jsonType: "string" }`, `jrefValue` gives you a `string`. A function test
narrows only if it's a type predicate.

## Select values

`jrefSelect` and `jrefSelectAll` find values with a selector like `select` and
`selectAll` from `unist-util-select` do, following references along the way.
`jrefSelect` gives you the first value that matches, or `undefined` if none
does. `jrefSelectAll` gives you all of them in the order it reaches them.

```typescript
import { jrefSelect, jrefSelectAll } from "@hyperjump/browser";

const film = await browse(session, "https://swapi.hyperjump.io/api/films/1");

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
`> [key=director][jsonType=string]` gives you a target for a string, so
`jrefValue` gives you a `string`. Without one, `jrefValue` gives you a
`string | number | boolean | null`.

```typescript
const director = await jrefSelect(
  session,
  "> [key=director][jsonType=string]",
  film
);
if (director) {
  await jrefValue(session, director); // "George Lucas"
}
```

The Hyperjump session only follows a reference if the selector could match the
value it leads to or something inside it. `> [key=director]` doesn't retrieve
any characters because none of them can be the film's `director`, and
`jrefSelect` stops at the first match. A selector without `>` like `[key=name]`
can match at any depth, so it follows every reference under the value you start
from. On an API like this one that could be the whole API, so start a selector
with `>` unless you mean to search everything.

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

Each `target` can also be a document, which starts at its root. A target that's
a reference starts at what it leads to, unless the options have
`reference: "manual"`.

| Function | Description |
| --- | --- |
| `jrefStep(session, key, target, options)` | The member at a property name or an array index |
| `jrefValue(session, target, options)` | The value of a string, number, boolean, or null as JavaScript |
| `jrefJsonType(session, target, options)` | The kind of JSON value: `"object"`, `"array"`, `"string"`, `"number"`, `"boolean"`, or `"null"` |
| `jrefArrayIter(session, target, options)` | The items of an array, as an async iterator |
| `jrefObjectValues(session, target, options)` | The values of an object's properties, as an async iterator |
| `jrefObjectEntries(session, target, options)` | An object's property names and values, as an async iterator |
| `jrefObjectKeys(session, target, options)` | An object's property names, as an async iterator |
| `jrefObjectHas(session, key, target, options)` | Whether an object has a property |
| `jrefVisit(session, target, test, visitor, options)` | Visits the target and every value under it. The `test` is optional. |
| `jrefFind(session, target, test, options)` | The first value that passes the test, or `undefined` |
| `jrefFindAll(session, target, test, options)` | Every value that passes the test |
| `jrefSelect(session, selector, target, options)` | The first value that matches the selector, or `undefined` |
| `jrefSelectAll(session, selector, target, options)` | Every value that matches the selector |

| Option | Description |
| --- | --- |
| `reference` | `"follow"`, the default, follows references. `"manual"` reads the tree as it's written. For more information, see [Follow references yourself](references.md#read-the-tree-as-its-written). |
| `maxDepth` | How many levels below the target a walk can go. The default is 1000. Only `jrefVisit`, `jrefFind`, `jrefFindAll`, `jrefSelect`, and `jrefSelectAll` take it. For more information, see [How deep a walk goes](#how-deep-a-walk-goes). |

When these functions follow a reference, they throw what `browse` throws. For
more information, see [Browse to a URL](browse-to-a-url.md#errors). For the errors of
their own, see [Errors](errors.md#other-errors).
