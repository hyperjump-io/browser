# Pausing walks

First recorded 2026-11-18.

A walk waits for the next task every so many nodes, so a timer or a
request to cancel can abort it (see
[Stopping a walk](../components/browsing.md#stopping-a-walk)). How often
it waits was measured by visiting a document of 110,002 nodes as it's
written, with `reference: "manual"` and a visitor that does nothing:

| Waits for the next task | Median of 9 walks, in 3 processes |
| --- | --- |
| Never | 68.1, 70.2, 68.0 ms |
| Every 100 nodes | 67.1, 67.8, 66.0 ms |
| Every 1000 nodes | 65.5, 65.1, 62.6 ms |
| Every 10,000 nodes | 63.6, 67.0, 63.9 ms |

Waiting even every 100 nodes costs less than the difference between
processes. A node is about 600 nanoseconds, so a walk waits about every
millisecond at 1000 nodes. A visit of a document whose levels each refer
to the next one twice, 18 levels and 1,048,557 visits, took 5.1 s without
waiting and 5.0 s waiting every 1000 nodes, and a 10 ms timer ran at
11 ms instead of after the walk.

Measured in Node.js 26, where the next task is `setImmediate`.

In a browser, the next task is a `MessageChannel`. The same document,
110,001 nodes as the page builds it, in Chromium 157 and Firefox 160 on
Linux, with the median of 9 walks in each of 3 rounds:

| Waits for the next task | Chromium 157 | Firefox 160 |
| --- | --- | --- |
| Never | 54.5, 53.7, 52.5 ms | 59.0, 60.0, 58.0 ms |
| Every 100 nodes | 73.9, 70.6, 70.4 ms | 64.0, 64.0, 62.0 ms |
| Every 1000 nodes | 54.3, 54.2, 53.5 ms | 56.0, 57.0, 56.0 ms |
| Every 10,000 nodes | 51.0, 52.9, 51.1 ms | 57.0, 58.0, 56.0 ms |

A wait is 16.2 µs in Chromium and 4.5 µs in Firefox, so in Chromium
waiting every 100 nodes costs a third of the walk, about 1100 waits, and
every 1000 nodes costs less than the difference between rounds. A 10 ms
timer ran at 10.9 ms in Chromium and 11 ms in Firefox, instead of after
the walk.

The deep visit, alternating, starting with waiting:

- Chromium: 4.30, 4.36, and 4.45 s waiting every 1000 nodes, and 4.21,
  4.27, and 4.38 s without waiting, about 2% more.
- Firefox: from 6.7 s to 13.4 s in either setting, run to run, so it
  can't tell them apart.

Safari wasn't measured.
