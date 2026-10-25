# Getting started

This example uses the API at
[https://swapi.hyperjump.io](https://explore.hyperjump.io#https://swapi.hyperjump.io/api/films/1).
It's a variation of the [Star Wars API (SWAPI)](https://swapi.dev) implemented
using the [JRef] media type.

```javascript
import { Hyperjump } from "@hyperjump/browser";

const h = new Hyperjump({ allowRetrieval: ["https://swapi.hyperjump.io/"] });
const session = h.session();
const aNewHope = await session.get("https://swapi.hyperjump.io/api/films/1");
const characters = await session.step("characters", aNewHope);

for await (const character of session.iter(characters)) {
  const name = await session.step("name", character);
  session.value(name); // => Luke Skywalker, etc.
}
```

A `Hyperjump` holds configuration, like which URI schemes and media types are
supported. Documents are retrieved through a session. A session retrieves each
document once and keeps it for as long as the session is used, so start a new
session to see changes.

You can also work with files on the file system. When working with files, media
types are determined by file extensions. The [JRef] media type uses the `.jref`
extension.

```javascript
import { Hyperjump } from "@hyperjump/browser";

const session = new Hyperjump().session();
const lukeSkywalker = await session.get("./api/people/1.jref"); // Paths resolve relative to the current working directory
const name = await session.step("name", lukeSkywalker);
session.value(name); // => Luke Skywalker
```

[JRef]: ../src/jref/README.md
