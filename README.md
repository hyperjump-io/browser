JSON Reference
==============

This is an implementation inspired by the
[JSON Reference I-D](https://tools.ietf.org/html/draft-pbryan-zyp-json-ref-03).
The goal is to make some improvements to the specification and define an
`application/reference+json` media type.

Installation
------------

```bash
npm install @hyperjump/json-reference --save
```

Usage
-----

```http
GET http://json-reference.hyperjump.io/example1 HTTP/1.1
Accept: application/reference+json
```

```http
HTTP/1.1 200 OK
Content-Type: application/reference+json

{
  "foo": "bar",
  "aaa": { "$ref": "#/foo" },
  "ccc": { "$ref": "#/aaa" },
  "ddd": {
    "111": 111,
    "222": { "$ref": "#/aaa/bbb" }
  },
  "eee": ["a", { "$ref": "#/ddd/111" }],
  "fff": {
    "$id": "http://json-reference.hyperjump.io/example2",
    "abc": 123
  }
}
```

```javascript
import * as JRef from "@hyperjump/json-reference";

(async () => {
  // Get a document by absolute URL
  const doc = await JRef.get("http://json-reference.hyperjump.io/example1");

  // Get a document with a relative URL using another document as the context
  const aaa = await JRef.get("/aaa", doc);

  // Get the value of a document
  JRef.value(aaa); // => "bar"

  // Get the JSON Pointer for the document
  JRef.pointer(aaa); // => "/aaa"

  // Map over a document whose value is an array
  const eee = JRef.get("#/eee");
  const getType = (item) => typeof JRef.value(item);
  const types = await JRef.map(getType, eee); // => ["string", "number"];

  // Get the key/value pairs of a document whose value is an object
  const ddd = JRef.get("#/ddd");
  await JRef.entries(ddd); // => [
                           //      ["111", await JRef.get("#/ddd/111", doc)],
                           //      ["222", await JRef.get("#/ddd/222", doc)]
                           //    ]
}());
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

History
-------

JSON Reference is best known for it's part in JSON Schema. Although it had an
author in common with JSON Schema, JSON Reference started as an independant,
standalone specification. Both JSON Schema and JSON Reference were abandoned by
their authors before reaching RFC status. In 2016, a new group picked up the
JSON Schema specification and eventually folded the JSON Reference into JSON
Schema.

With this implementation, I use JSON Reference draft-03 from the original
authors as a starting point and evolve the concept from there. Therefore, this
implementation IS NOT the same JSON Reference used in recent drafts of JSON
Schema.

Documentation
-------------

To understand how this implementation works, you need to think about it like a
document in a browser. Like HTML in a web browser, a JSON Reference document is
identified by a URL and relative URLs within the document are resolved against
that URL.

An HTTP message with `Content-Type: application/reference+json` should interpet
the body of the message as a JSON Reference document. This content is JSON that
can be parsed with any [RFC-7150](https://tools.ietf.org/html/rfc7159) compliant
JSON parser. The URL fragment used to identify the document should be interpreted
as a JSON Pointer ([RFC-6901](https://tools.ietf.org/html/rfc6901)). The "value"
of the document is the result of applying the JSON Pointer to the JSON message
body.

Request:
```http
GET /example#/aaa HTTP/1.1
Accept: application/reference+json
```

Response:
```http
HTTP/1.1 200 OK
Content-Type: application/reference+json

{
  "foo": "bar",
  "aaa": {
    "bbb": 222,
    "$ref": "#/foo"
  },
  "ccc": { "$ref": "#/aaa" }
}
```

Value:
```json
"bar"
```

In a JSON Reference document, the property name, `$ref`, has special meaning. It
defines a reference to another document or a different part of the current
document. The value of the `$ref` property should be a URL defined as a JSON
string.

When the "value" is an object with a `$ref` property, it should be like following
a link to the URL defined by the `$ref`. It's a little like an iframe in HTML.
It's a document within a document.

When the "value" is an object with an "$id" property, it should be interpreted
as a separate JSON Reference document embedded in the document. The `$id` is
equivalent to `$ref` if the `$ref` were followed and inlined into the document.
This is a little like the HTTP/2 server push feature. It's sending additional
documents with the request because we know the client is just going to request
those documents next.

The JSON Pointer fragment is not aware of the semantics of the `$ref` and `$id`
keywords. Therefore, it is possible to point to values that don't make sense
for a JSON Reference document. In the example above, we can request
`/example#/aaa/bbb` and get `222` even though `/example#/aaa` is a reference.
We allow this because we don't want JSON Pointer implementations to have to be
aware of JSON Reference, but doing things like this is highly discouraged and
will cause problems when inlining documents with `$id`.
