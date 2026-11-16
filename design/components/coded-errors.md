# Errors with codes (`src/json/coded-error.js`)

Every failure an application might handle says why with a `cause.code` and
has the exact URL it's about as its `url`. A network error does (see
[Network errors](network-errors.md)), and so does everything else, so code
handles every failure the same way.

- `codedError(message, cause, url)` is an `Error` with the cause and the
  URL. Its message is for a person, so it says a `file:` URL relative to
  the working directory (see [Local paths in errors](file-urls.md)), and
  the `url` is exact.
- A cause can have more than the code, like a `status` or a `chain`.
- A code is named like Node.js's own codes, as a network error's are.

| Code | Failure | From |
| --- | --- | --- |
| `ERR_POINTER_NOT_FOUND` | A property or an item that doesn't exist | `jsonStep`, `jsonPointerGet`, and what's built on them, like `get` ([The JSON AST](json-ast.md)) |
| `ERR_POINTER_INVALID_INDEX` | A key that isn't an array index, for an array | the same |
| `ERR_POINTER_DUPLICATE_PROPERTY` | A property name an object has more than once, which RFC 6901 says fails | the same |
| `ERR_POINTER_NOT_INDEXABLE` | A step into a scalar, or into a value that's missing or invalid | the same |
| `ERR_INVALID_VALUE` | A value that couldn't be parsed, which JSON can't say | `toJson` |
| `ERR_STRUCTURED_VALUE` | The value of an object or an array, which could have references in it. The `url` is the node's location. | `jrefValue` ([Browsing](browsing.md)) |
| `ERR_MAX_DEPTH` | A walk that would go deeper than its `maxDepth`. The cause has the `maxDepth`, and the `url` is the node it would go under. | `jrefVisit`, `jrefFind`, `jrefFindAll`, `jrefSelect`, and `jrefSelectAll` ([Browsing](browsing.md)) |
| `ERR_SYNTAX` | A document with a syntax error. The error is a `SyntaxError`, and the cause is the syntax error, with its `source`, `ruleId`, and `place`. | the JSON and JRef plugins ([Media types](media-types.md)) |
| `ERR_HTTP_STATUS`, `ERR_UNSUPPORTED_MEDIA_TYPE`, `ERR_ABSOLUTE_FILE_URL`, `ERR_REFERENCE_CYCLE` | A document that can't be used | `get` ([Documents](documents.md)) |

What isn't a failure to handle doesn't have a code:

- A mistake in how a function is called is a `TypeError` or a `RangeError`
  with a message, as the platform's are: a URL that isn't one, a quality
  that isn't one, a pointer that isn't a JSON Pointer, a value `fromJs`
  can't represent, and a part that isn't supported in a browser. It's a
  bug to fix, not something to catch.
- The unified plugins report syntax errors as `VFileMessage`s, with
  `source` and `ruleId`, which is how unified reports.

Rejected:

- A `JsonPointerError` class. A caller would import it to check it,
  `instanceof` fails when two copies of the package are installed, and it
  would be the one failure that isn't told by a code.
- One code for every pointer failure. Code that reads a document tells a
  property that isn't there, which is often fine, from a step that makes
  no sense.
- A `TypeError` for `toJson` with an invalid value. The tree is data from
  a document, so it's a failure, not a mistake in the call.
- A syntax error's `ruleId` as the code. Code would have to list every
  rule to know an error is a syntax error.
