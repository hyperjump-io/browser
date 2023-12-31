# JSON Reference (JRef) Specification

## Introduction

JSON Reference (JRef) is an extension of the [JSON] data interchange format.
JRef extends [JSON] to add a "reference" type. The spirit of this specification
is to continue the work started by the [JSON Reference I-D]. This specification
is 100% compatible with those drafts, but defines things in different way and
assigns a media type identifier.

## Media Type

The JRef media type is identified as `application/reference+json` and uses the
`jref` file extension.

### Fragments

A [URI fragment] that is empty or starts with a `/` MUST be interpreted as a
[JSON Pointer]. The secondary resource identified by a [JSON Pointer] fragment
is the JRef value obtained by applying the [JSON Pointer] to the full JRef
document without following references.

The semantics of a [URI fragment] that isn't a [JSON Pointer] are undefined.

### Profiles

This media type allows the "profile" media type parameter as defined by [RFC
6906](https://www.rfc-editor.org/rfc/rfc6906).

## Inheriting from [JSON]

JRef inherits all syntax and semantics defined for [JSON] except for the special
case of the reference type which has overlapping syntax with [JSON] objects.

## The "reference" Type

A "reference" represents a web-style uni-directional link to a location in
either the current document or a different resource.

### Syntax

A value that has the syntax of a [JSON] object is considered a "reference" type
if it has a `$ref` property whose value is of type "string". If either of those
constraints aren't met, the value is considered a normal [JSON] object.

The semantics of any properties other than `$ref` in a "reference" are
undefined.

The "reference" type is a scalar value that can not be indexed into like a
[JSON] object despite the syntactic similarity with a [JSON] object.

```json
{ "$ref": "https://example.com/example.json#/foo/bar" }
```

### Semantics

The value of `$ref` in a reference is a [URI-reference]. The process for
determining the base URI for the document is defined by [RFC 3986 Section
5.1].

References are intended to be transparent the same way they are in most
programming languages. If the user requests the value of a location in a JRef
document that has type "reference", implementations are expected to follow the
reference and present the user with the resulting value.

```json
{
  "foo": { "$ref": "#/bar" },
  "bar": 42
}
```

The value of applying the [JSON Pointer] `/foo` to this document should be 42
not a reference.

Requesting the value of a reference with a [JSON Pointer] [URI fragment] that
points to a non-existent location in the document MUST NOT result in any value.
Implementations MAY raise an error in this case.

#### Following a Reference

The [URI scheme] determines the protocol to be used to retrieve the referenced
document. There are no requirements concerning which [URI scheme]s an
implementation must or can support.

When following a [URI] that uses a protocol where the response is self
describing of its media type, implementations MUST respect the declared media
type. For example, an [HTTP] response for `https://example.com/foo` that has
`Content-Type: application/json` MUST be treated as a plain [JSON] document
rather than as a JRef document. That means that any objects with a string
`$href` property would be of type "object" rather than type "reference".

Following a reference may result in media types other than JRef being returned.
While implementations are not limited to only handling JRef responses, they MUST
raise an error if they encounter a media type they don't support.

When following a [URI] using a protocol where the response is not self
describing of its media type (such as file system access with a [`file:` URI]),
implementations MAY use whatever heuristic they deem necessary to determine the
media type of the response including context hints from the referring document.
If implementations use file extensions as a heuristic, they SHOULD use the [IANA
media types registry] to determine which file extensions map to which media
types.

A reference that includes a [URI fragment] MUST interpret and apply the [URI
fragment] according to the semantics defined for the target document. For
example, if the target document has the media-type `application/json`, the
fragment must be ignored.

Implementations MAY define how non-JRef media types translate to a
JRef-compatible value.

## Security Considerations

### Referential Cycles

Implementations MUST ensure that referential cycles don't lead to infinite
loops.

```json
{
  "foo": { "$ref": "#/bar" },
  "bar": { "$ref": "#/foo" }
}
```

```json
{
  "foo": { "$ref": "#/bar" },
  "bar": { "$ref": "#/baz" },
  "baz": { "$ref": "#/foo" }
}
```

### HTTP

Retrieving resources over a network carries certain risks and implementations
MAY provide safeguards to protect users, but network safety is generally the
concern of the network engineer of the application using the implementation.

### File System Access

Retrieving resources from the file system carries certain risks and
implementations SHOULD provide safeguards to protect users. The following are
recommendations for implementations that support file system access.

References to a file SHOULD only be allowed from a file located on the same file
system. A document from a potentially untrusted source SHOULD not be allowed to
reference a document on the local file system.

[`file:` URI]s that expose unnecessary file system details SHOULD NOT be allowed
to appear in references. When using file-based documents, users should use
[relative-ref URI]s to reference files relative the document's location.

Implementations MAY automatically limit file system access to specific locations
such as the root of the application using the implementation. Implementations
MAY also allow users to configure which locations are allowed to be referenced.

[JSON]: https://www.rfc-editor.org/rfc/rfc8259
[JSON Pointer]: https://www.rfc-editor.org/rfc/rfc6901
[URI]: https://www.rfc-editor.org/rfc/rfc3986
[URI fragment]: https://www.rfc-editor.org/rfc/rfc3986#section-3.5
[URI scheme]: https://www.rfc-editor.org/rfc/rfc3986#section-3.1
[URI-reference]: https://www.rfc-editor.org/rfc/rfc3986#section-4.1
[relative-ref URI]: https://www.rfc-editor.org/rfc/rfc3986#section-4.2
[RFC 3986 Section 5.1]: https://www.rfc-editor.org/rfc/rfc3986#section-5.1
[HTTP]: https://www.rfc-editor.org/rfc/rfc9110
[`http:` URI]: https://www.rfc-editor.org/rfc/rfc9110#section-4.2.1
[`https:` URI]: https://www.rfc-editor.org/rfc/rfc9110#section-4.2.2
[`file:` URI]: https://www.rfc-editor.org/rfc/rfc8089.html
[IANA media types registry]: https://www.iana.org/assignments/media-types/media-types.xhtml
[JSON Reference I-D]: https://datatracker.ietf.org/doc/html/draft-pbryan-zyp-json-ref-03
