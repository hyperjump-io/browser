Hyperjump Browser
=================

The hyperjump browser is an experimental generic hypermedia client. It aims to
provide a uniform interface for working with hypermedia enabled media types.
When you use a web browser, you don't interact with HTML, you interact with the
UI that the HTML represents. The hyperjump browser aims to do the same except
with data. It abstracts away the hypermedia so you can work data as if it's just
plain JSON data without having to leave the browser.

The hyperjump browser allows you to plug in support for different media types,
but it comes with support for `application/reference+json`. This media type is
based on the [JSON Reference I-D](https://tools.ietf.org/html/draft-pbryan-zyp-json-ref-03)
with some additions and improvements.

Installation
------------

```bash
npm install @hyperjump/browser --save
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

Usage
-----

The following is a quick set of examples with little explanation. See the *JSON
Reference* section below for the theory behind JSON Reference.

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
const JRef = require("@hyperjump/browser/json-reference");

(async () => {
  // Get a document by absolute URL
  const doc = await JRef.get("http://json-reference.hyperjump.io/example1", JRef.nil);

  // Get a document with a relative URL using another document as the context
  const aaa = await JRef.get("/aaa", doc);

  // Get the value of a document
  JRef.value(aaa); // => "bar"

  // Get the JSON Pointer for the document
  JRef.pointer(aaa); // => "/aaa"

  // Map over a document whose value is an array
  const eee = JRef.get("#/eee", doc);
  const types = await JRef.map((item) => typeof JRef.value(item), eee); // => ["string", "number"];

  // Get the key/value pairs of a document whose value is an object
  const ddd = JRef.get("#/ddd", doc);
  await JRef.entries(ddd); // => [
                           //      ["111", JRef.get("#/ddd/111", doc)],
                           //      ["222", JRef.get("#/ddd/222", doc)]
                           //    ]
}());
```

JSON Reference
==============

History
-------

JSON Reference is best known for its role in JSON Schema. Although it had an
author in common with JSON Schema, JSON Reference started as an independent,
standalone specification. Both JSON Schema and JSON Reference were abandoned by
their authors before reaching RFC status. In 2016, a new group picked up the
JSON Schema specification and eventually folded JSON Reference into JSON Schema.

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

An HTTP message with `Content-Type: application/reference+json` should be
interpreted as a JSON Reference document. This content is a JSON object that can
be parsed with any [RFC-7150](https://tools.ietf.org/html/rfc7159) compliant
JSON parser. The URL fragment used to identify the document should be
interpreted as a JSON Pointer ([RFC-6901](https://tools.ietf.org/html/rfc6901)).

### Value

The "value" of a JSON Reference document is the result of applying the JSON
Pointer in the URL fragment to the JSON message body. In the following example,
the URL is `http://json-reference.hyperjump.io/example#/foo`, which means the
fragment is `/foo`, and the "value" is `"bar"`.

Request:
```http
GET http://json-reference.hyperjump.io/example#/foo HTTP/1.1
Accept: application/reference+json
```

Response:
```http
HTTP/1.1 200 OK
Content-Type: application/reference+json

{
  "foo": "bar"
}
```

### $ref

In a JSON Reference document, the `$ref` property defines a reference to another
document or a different part of the current document. The value of the `$ref`
property is a string that defines a relative or absolute URL as specified by
[RFC-3986](https://tools.ietf.org/html/rfc3986).

When the "value" is an object with a `$ref` property, it should follow the
reference like following a link. In the following example the fragment points
`/aaa`, which is a reference that points to `/foo`, and thus the "value" is
`"bar"`.

Request:
```http
GET http://json-reference.hyperjump.io/example#/aaa HTTP/1.1
Accept: application/reference+json
```

Response:
```http
HTTP/1.1 200 OK
Content-Type: application/reference+json

{
  "foo": "bar",
  "aaa": { "$ref": "#/foo" }
}
```

A `$ref` is a document boundary that JSON Pointers should not cross. `$ref`s
should not be followed in order to resolve the fragment's JSON Pointer.

### $id

In a JSON Reference document, the `$id` property is a string that defines an
absolute URL that identifies a document within the parent document. It's the
inlined version of a `$ref`. This is a little like the HTTP/2 server push
feature. It's sending additional documents with the request because we know the
client is just going to request those documents next.

In the example below, the "value" of the document is `111`.

Request:
```http
GET http://json-reference.hyperjump.io/example#/foo HTTP/1.1
Accept: application/reference+json
```

Response:
```http
HTTP/1.1 200 OK
Content-Type: application/reference+json

{
  "foo": {
    "$id": "http://json-reference.hyperjump.io/example2#/aaa",
    "aaa": 111
  }
}
```

An `$id` is a document boundary that JSON Pointers should not cross. A JSON
Reference's fragment JSON Pointer should not point to a separate document
inlined with `$id`.

#### Limitations

The problem with inlining `$ref`s with `$id` is that we don't get the HTTP
headers that describe important things like caching. An optional `$headers`
keyword is being considered.
