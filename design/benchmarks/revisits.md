# Revisits

First recorded 2026-11-18.

`maxRevisits` (see
[Stopping a walk](../components/browsing.md#stopping-a-walk)) was chosen
by visiting the 57 schemas in `sourcemeta/jsonschema-benchmark`, from
SchemaStore, as JRef with their references followed. References that leave
a schema's file weren't followed. For each one, the most times the visit
went back under one node, and the nodes it had reached then:

| Schema | Nodes | Visits | Most times under one node | Nodes reached then | Times for each node reached |
| --- | --- | --- | --- | --- | --- |
| `biome` | 75,035 | 638,541 | 17,137 | 24,249 | 0.71 |
| `cql2` | 1,896 | 127,381 | 1,077 | 703 | 1.53 |
| `ui5-manifest` | 22,923 | 39,273 | 963 | 7,891 | 0.12 |
| `tslint` | 9,861 | 24,667 | 407 | 3,538 | 0.12 |
| `turborepo` | 2,190 | 2,473 | 143 | 777 | 0.18 |

No other schema went back under a node more than 134 times, and 18 never
went under one twice. One couldn't be visited, because the reference at its
root leaves the file.

- A limit of 10,000 with no comparison would be an error for `biome`, whose
  sharing grows with the document.
- Comparing with the nodes reached, with a limit of 1,000, would be an
  error for `cql2`, a grammar whose definitions refer to each other.
- Comparing with the references followed, and not every node, was an error
  for `biome`, whose sharing is nested.
- Comparing with 10 times the nodes reached, with a limit of 10,000, isn't
  an error for any of them. The nearest are `cql2` at 15% of the multiple and
  `biome` at 7%.

A document of 1,673 bytes whose 40 levels each refer to the next one twice
is an `ERR_MAX_REVISITS` after 30,039 visits, in 188 ms. Without the guard,
it's 2^40 visits.

Keeping every node a visit reaches costs a visit that follows references
10–15%, the median of 5 visits with the guard and with `maxRevisits:
Infinity`, alternating:

| Schema | Guard | `Infinity` |
| --- | --- | --- |
| `biome` | 3475 ms | 3130 ms |
| `cql2` | 227 ms | 204 ms |
| `krakend` | 55 ms | 48 ms |
| `wrangler` | 63 ms | 55 ms |

A visit with `reference: "manual"` doesn't keep them.

Measured in Node.js 26.
