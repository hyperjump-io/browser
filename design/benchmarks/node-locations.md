# Node locations

First recorded 2026-10-24.

Encoding each segment of a node's location was most of the time `fromJs`
took, though most property names repeat. `appendToLocation` caches the
encoded form of each segment (up to 10,000 names of up to 100 characters,
cleared when full), and appends array indexes without encoding, because
they never need it.

| | Time, as a fraction of before |
| --- | --- |
| `fromJs` | 0.35–0.54 |
| Parsing | 0.82–0.92 |

Measured on SchemaStore's `package.json` and `tsconfig.json` instances and
OpenAPI 3.0's.
