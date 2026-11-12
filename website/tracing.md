# Tracing

Every request a session makes has a record of what happened to it, like a row
in a browser's network panel. A `Trace` collects the records of a session, and
draws them as a waterfall:

```typescript
import { Session, Trace } from "@hyperjump/browser";

const trace = new Trace(session);

const page = await session.fetch("https://example.com/index.html");
await session.fetch(new URL("main.css", page.url), { priority: "high", initiator: page });
// ...

console.log(trace.waterfall());
```

```text
  # url                                  source           stat  0ms                            195ms
  1 example.com/index.html               network          200  |████████████                        |
  2 ↳ example.com/main.css               network          200  |           █████████████            |
  3 ↳ example.com/app.js                 network          200  |           ████████████             |
  4 ↳ example.com/old-logo.png           network          200  |           ░░░░░░░░░░░██████████████|
  5 ↳ example.com/hero.jpg               network          200  |           ░░░░░░░░░░░█████████     |
  6 ↳ example.com/footer.jpg             network          200  |           ░░░░░░░░░░░░███████      |
```

Each row is a request, under the request that caused it. `░` is time it waited
for the throttle or the scheduler, and `█` is time it was loading. The style
sheet and the script went first in this example. The images waited, and the logo
redirected.

## What caused a request

Pass the response that caused a request as `initiator`, such as the page that
refers to a style sheet. The waterfall puts each request under its initiator.

## Records

A response's record is `responseMeta(response).record`. It has what the request
asked for, what each layer did, and how it ended:

| Property | Description |
| --- | --- |
| `url`, `method` | What the request asked for |
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
| `_priority` | The priority the layers gave the request, the way Chrome names it |
| `_source`, `_cache` | Where the response came from, and what the HTTP cache did |
| `_marks` | What each layer did, in milliseconds from the request's start |
| `_error` | Why the request failed |

## Watch a session

To see requests as they happen, use `session.observe`. Your observer gets an
event when each request starts, gets a mark from a layer, gets its response, and
ends:

```typescript
const stop = session.observe((event) => {
  if (event.type === "end") {
    console.log(event.record.url, event.record.status);
  }
});
```
