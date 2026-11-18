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

Measured in Node.js 26, where the next task is `setImmediate`. A
browser's `MessageChannel` wasn't measured.
