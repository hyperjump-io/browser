# Reviver and second pass

First recorded 2026-11-01.

`fromJref` makes objects with a `$ref` references in a pass over the tree
after `fromJson` parses it. It was compared to annotating them with a
reviver called during the parse, which is one pass. The parser calls no
reviver.

| | Time, as a fraction of the reviver |
| --- | --- |
| `fromJref` | 0.94–1.08 |
| `fromJson` | 0.93–1.00 |

`fromJref` is slowest on the documents with the most references. It's
1.02–1.08 on SchemaStore's schemas and 1.03–1.07 on OpenAPI 3.0's
instances. It's 0.94–1.03 on SchemaStore's `package.json` and
`tsconfig.json` instances.

Measured on those documents in Node.js, pretty-printed, with the median of
15 rounds in each of 5 processes for each version.
