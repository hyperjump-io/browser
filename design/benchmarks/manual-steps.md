# Async steps as written

First recorded 2026-11-16.

With `reference: "manual"`, the step functions follow nothing and wait for
nothing, but they're async. A synchronous step was compared to them in
two ways, on 37 real schemas from sourcemeta's jsonschema-benchmark.

Compiling with `@hyperjump/json-schema` v2, whose lowering steps through
the values of keywords that hold schemas as they're written:

| | Time, as a fraction of the async steps |
| --- | --- |
| A synchronous reader, with lowering's `for await` loops as they are | 0.97–1.01 |
| A synchronous reader, with plain `for` loops | 0.93–0.98 |

No schema was more than about 0.86. Most keywords' values are data, which
lowering reads from the node without a step.

Walking every node of a document as written, with `jrefObjectEntries` and
`jrefArrayIter`, compared to a loop over the nodes' children:

| | Nodes | Async | Sync | Async, as a fraction of parsing |
| --- | --- | --- | --- | --- |
| ui5-manifest | 8,786 | 3.1 ms | 0.18 ms | 0.27 |
| krakend | 6,219 | 2.4 ms | 0.19 ms | 0.25 |
| cmake-presets | 1,552 | 0.64 ms | 0.03 ms | 0.28 |
| geojson | 1,037 | 0.32 ms | 0.015 ms | 0.30 |

An async step is 300–400 ns a node, 12–21 times a synchronous one, and a
walk of a whole document is about a quarter of the time parsing it takes.

Measured in Node.js 26. Compiling is the median of 11 rounds of 100 ms in
each of 3 processes, alternating round by round. Walking is the median of
9 rounds of 200 ms.
