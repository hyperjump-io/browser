# Tracing

Every request a session makes has a record of what happened to it, like a row
in a browser's network panel. A `Trace` collects the records of a session and
its child sessions, and draws them as a waterfall:

```typescript
import { Session, Trace } from "@hyperjump/browser";

const trace = new Trace(session);

const page = await session.fetch("index.html", { destination: "document" });
await session.fetch("main.css", { destination: "style", initiator: page });
// ...

console.log(trace.waterfall());
```

```text
  # url                                  dest     source           stat  0ms                            195ms
  1 example.com/index.html               document network          200  |████████████                        |
  2 ↳ example.com/main.css               style    network          200  |           █████████████            |
  3 ↳ example.com/app.js                 script   network          200  |           ████████████             |
  4 ↳ example.com/old-logo.png           image    network          200  |           ░░░░░░░░░░░██████████████|
  5 ↳ example.com/hero.jpg               image    network          200  |           ░░░░░░░░░░░█████████     |
  6 ↳ example.com/footer.jpg             image    network          200  |           ░░░░░░░░░░░░███████      |
  7 ↳ example.com/main.css               style    joined #2        200  |            ████████████            |
```

Each row is a request, under the request that caused it. `░` is time it waited
for the throttle or the scheduler, and `█` is time it was loading. In this
example, the stylesheet and the script went first. The images waited, the logo
was redirected, and the second `main.css` joined the first request instead of
loading again.

## What caused a request

Pass the response that caused a request as `initiator`, such as the page that
refers to a stylesheet. The waterfall puts each request under its initiator.

## Records

A response's record is `responseMeta(response).record`. It has what was asked
for, what each layer did, and how it ended:

| Property | Description |
| --- | --- |
| `url`, `method`, `destination` | What was asked for |
| `initiator` | The record of the request that caused it |
| `marks` | What each layer did, and when, such as `"redirect"` or `"scheduler:queued"` |
| `status`, `finalUrl`, `source`, `cache` | How it ended, and where its response came from |
| `startTime`, `responseTime`, `endTime` | When it started, got its response, and finished |
| `error` | Why it failed, if it did |

`endTime` and the body's size are only known for requests made while someone
was watching, such as a `Trace`.

Your own layers can add marks with `ctx.record.mark(name, detail)`.

## Options

| Option | Description |
| --- | --- |
| `children` | `false` to leave out the requests of child sessions |
| `bodies` | `true` to keep response bodies on the records |

To stop recording, call `trace.stop()`. `trace.toJSON()` gives the records as
plain data.

## Open a trace in devtools

`trace.toHar()` makes a HAR file, the format browser devtools import and
export, so you can open a trace in Chrome's or Firefox's network panel:

```typescript
import { writeFile } from "node:fs/promises";

const trace = new Trace(session, { bodies: true });
// ...
await writeFile("load.har", JSON.stringify(trace.toHar({ title: "Page load" })));
```

The HAR has every request's headers, status, and size, and its body if the
trace keeps bodies. Each redirect is an entry of its own. A request's
`blocked` time is how long it waited for the throttle or the scheduler. DNS,
connection, and TLS times aren't known, so they're `-1`.

Some fields start with `_`, which HAR allows for extra information:

| Field | Description |
| --- | --- |
| `_initiator` | The request that caused this one |
| `_priority`, `_resourceType` | The priority the request was given, and its destination, the way Chrome shows them |
| `_source`, `_cache` | Where the response came from, and what the HTTP cache did |
| `_marks` | What each layer did, in milliseconds from the request's start |
| `_error` | Why the request failed |

## Watch a session

To see requests as they happen, use `session.observe`. It tells you when each
request starts, is marked by a layer, gets its response, and ends:

```typescript
const stop = session.observe((event) => {
  if (event.type === "end") {
    console.log(event.record.url, event.record.status);
  }
});
```
