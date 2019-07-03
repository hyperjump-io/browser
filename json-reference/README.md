# JSON Reference

JSON Reference is best known for its role in JSON Schema. Although it had an
author in common with JSON Schema, JSON Reference started as an independent,
standalone specification. Both JSON Schema and JSON Reference were abandoned by
their authors before reaching RFC status. In 2016, a new group picked up the
JSON Schema specification and eventually folded JSON Reference into JSON Schema.

With this implementation, I use [JSON Reference draft-03][refdraft3] from the
original authors as a starting point and evolve the concept from there.
Therefore, _the `$href` and `$embedded` in this implementation ARE NOT a simple
renaming of `$ref` and `$id` in recent drafts of JSON Schema_.

## Documentation

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
the URL is `http://jref.hyperjump.io/example#/foo`, which means the fragment is
`/foo`, and the "value" is `"bar"`.

Request:
```http
GET http://jref.hyperjump.io/example#/foo HTTP/1.1
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

### $href

In a JSON Reference document, the `$href` property defines a reference to
another document or a different part of the current document. The value of the
`$href` property is a string that defines a relative or absolute URL as
specified by [RFC-3986](https://tools.ietf.org/html/rfc3986).

When the "value" is an object with a `$href` property, it should follow the
reference like following a link. In the following example the fragment is
`/aaa`, which is a reference that points to `/foo`, and thus the "value" is
`"bar"`.

Request:
```http
GET http://jref.hyperjump.io/example#/aaa HTTP/1.1
Accept: application/reference+json
```

Response:
```http
HTTP/1.1 200 OK
Content-Type: application/reference+json

{
  "foo": "bar",
  "aaa": { "$href": "#/foo" }
}
```

A `$href` is a document boundary that JSON Pointers should not cross. `$href`s
should not be followed in order to resolve the fragment's JSON Pointer.

### $embedded

In a JSON Reference document, the `$embedded` property is a string that defines
an absolute URL that indicates a document embedded within the parent document.
It's the inlined version of a `$href`. This is a little like the HTTP/2 server
push feature. It's sending additional documents with the request because it's
likely that the client is going to request those documents next.

In the example below, the "value" of the document is `111`.

Request:
```http
GET http://jref.hyperjump.io/example#/foo HTTP/1.1
Accept: application/reference+json
```

Response:
```http
HTTP/1.1 200 OK
Content-Type: application/reference+json

{
  "foo": {
    "$embedded": "http://jref.hyperjump.io/example2#/aaa",
    "aaa": 111
  }
}
```

An `$embedded` document boundary that JSON Pointers should not cross. The
fragment's JSON Pointer can not point to a location inside an `$embedded`
document.

#### Limitations

The problem with inlining `$href`s with `$embedded` is that we don't get the
HTTP headers that describe important things like caching. An optional `$headers`
keyword is being considered.

[refdraft3]: https://tools.ietf.org/html/draft-pbryan-zyp-json-ref-03
