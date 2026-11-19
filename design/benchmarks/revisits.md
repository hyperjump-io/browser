# Revisits

First recorded 2026-11-18.

`maxRevisits` (see
[Stopping a walk](../components/browsing.md#stopping-a-walk)) was chosen
by visiting the 57 schemas in `sourcemeta/jsonschema-benchmark`, from
SchemaStore, as JRef with their references followed. References that leave
a schema's file weren't followed. For each one, how many times in all the
visit visited a node again, and the nodes it had reached:

| Schema | Size | Visits | Nodes reached | Visited again | For each node reached |
| --- | --- | --- | --- | --- | --- |
| `cql2` | 18 KB | 127,381 | 703 | 126,782 | 180 |
| `biome` | 815 KB | 638,541 | 24,249 | 619,115 | 25.5 |
| `cmake-presets` | 84 KB | 15,081 | 1,470 | 13,693 | 9.3 |
| `wrangler` | 366 KB | 49,664 | 5,053 | 44,703 | 8.8 |
| `gitlab-ci` | 126 KB | 19,998 | 2,295 | 17,845 | 7.8 |

No other schema visited nodes again more than 7 times for each node it
reached. The most for each node reached at any point in a visit is the
most at its end. One schema couldn't be visited, because the reference at
its root leaves the file.

- With 100 for each node reached and no limit beside it, `cql2` is an
  error. Its 126,782 is under the default of 250,000, with twice as much
  room as it needs.
- `biome`'s 619,115 is over the default, and under 100 times its nodes,
  2.4 million, with 4 times as much room as it needs.

Hostile documents, with the default, and with the guard that counted for
each node how many times a visit went back under it (10,000, or 10 times
the nodes reached):

| Document | Size | Counted for each node | Counted in all |
| --- | --- | --- | --- |
| 40 levels, each referring to the next one twice | 1.6 KB | 188 ms | 967 ms |
| 30 levels like that, to an array of 1,000 `null`s | 6 KB | 7.2 s | 167 ms |
| The same, with 4,000 `null`s | 21 KB | 112 s | |
| The same, with 160,000 `null`s | 800 KB | about 30 min | 13.5 s |

With other limits, counted in all:

| Default | For each node reached | 1.6 KB | 800 KB |
| --- | --- | --- | --- |
| 250,000 | 100 | 967 ms | 13.5 s |
| 1,000,000 | 100 | 3.9 s | 15 s |
| 1,000,000 | 1,000 | 3.9 s | 140 s |

Keeping every node a visit reaches and visits costs a visit that follows
references 10–20%, the median of 5 visits with the guard and with
`maxRevisits: Infinity`, alternating:

| Schema | Guard | `Infinity` |
| --- | --- | --- |
| `biome` | 2943 ms | 2594 ms |
| `cql2` | 149 ms | 126 ms |
| `krakend` | 40 ms | 34 ms |
| `wrangler` | 42 ms | 44 ms |

A visit with `reference: "manual"` doesn't keep them.

Measured in Node.js 26.
