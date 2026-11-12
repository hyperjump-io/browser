# How layers communicate

Layers are decorators, and they stay independent because only three things
pass between them:

1. The `Request` and the `Response`. What needs the layer below to do
   something says so in the request, like the session's
   `redirect: "manual"`.
2. The context fields the session defines: `session`, `cacheMode`,
   `priority`, `destination`, and `record`. Each has one typed meaning. A
   layer can give the one below it a changed copy, like a lower priority,
   but it can't add fields.
3. Response meta and record marks, which go out to whoever called `fetch`
   or is watching, like a trace.

And three things don't happen:

- No side channels. A need that crosses layers becomes a context field the
  session defines, the way priority and destination are.
- No layer reads another layer's marks, meta, or state. Marks are for
  watching.
- No layer finds or calls another layer. `findLayer` is for code that uses
  a stack, through a layer's public methods.

What's left is order. Some layers only work in some places in a stack,
because of what they see on the way down or up, and each one's document says
where it goes.

Rejected:

- A scratchpad on the context for layers to share (`extras`). It's a
  channel with no types and no owner, so two layers that used it would
  depend on each other's order and keys without saying so.
- Context fields as standard headers, like `Cache-Control` for the cache
  mode, `Priority` for priority, `Sec-Fetch-Dest` for the destination, and
  `Referer` for the initiator, so a layer sees only the request.
  - A priority can change while a request waits, which a header can't.
  - A browser doesn't let a script set `Sec-` headers or `Referer`. It
    drops them without an error, so a stack in a browser would see no
    destination, and act differently than it does in Node.js.
  - A header that's for layers goes to the server unless something below
    takes it out, so every transport would have to know which headers are
    the layers'. That's a side channel.
  - The session and the record aren't about the request, so no header
    could say them.
