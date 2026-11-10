# How layers communicate

Layers are decorators, and they stay independent because only three things
pass between them:

1. The `Request` and the `Response`. A layer that needs the one below to do
   something says so in the request, like `redirect: "manual"`.
2. The context fields the session defines: `session`, `signal`,
   `cacheMode`, `priority`, `destination`, and `record`. Each has one typed
   meaning. A layer can give the one below it a changed copy, like a lower
   priority or a shared request's signal, but it can't add fields.
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
  mode, `Priority` for priority, and `Sec-Fetch-Dest` for the destination,
  so a layer sees only the request. A priority can change while a request
  waits, which a header can't, and a browser doesn't let a script set
  `Sec-` headers.
