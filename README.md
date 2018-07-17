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
GET http://json-reference.hyperjump.com/example1 HTTP/1.1
Accept: application/reference+json
```

```http
HTTP/1.1 200 OK
Content-Type: application/reference+json

{
  "foo": "bar",
  "aaa": {
    "bbb": 222,
    "$ref": "#/foo"
  },
  "ccc": {
    "$ref": "#/aaa"
  }
}
```

```javascript
import * as JsonReference from "@hyperjump/json-reference";

const doc = JsonReference.get("http://json-reference.hyperjump.com/example1");

const aaa = JsonReference.get("/aaa", doc);
JsonReference.value(aaa); // => "bar"
JsonReference.pointer(aaa); // => "/aaa"
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
implementation is not the same JSON Reference used by JSON Schema.

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
GET /example#/foo HTTP/1.1
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
  "ccc": {
    "$ref": "#/aaa"
  }
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

When the "value" is an object with a `$ref` property, this should result in a
redirect to the URL defined by the `$ref`.

Unlike JSON Reference draft-03, properties adjacent to a `$ref` property are not
ignored, but they are often shadowed. In the example above, when we request
`/example#/aaa/bbb` we get `222`, but if we're iterating over each of the
properties in the response, when we get to `/example#/aaa` we get redirected to
`/foo` and `/aaa/bbb` is never reached.

Implementations are discouraged from inlining referenced documents. Inlining is
possible, but there are issues that we won't get into here.
