# Errors

*Coming soon*

When a request fails, `session.fetch` rejects with a network error, the
`TypeError` that `fetch` rejects with. A browser gives a network error for a
file that doesn't exist, a scheme it doesn't support, and a redirect it won't
follow, so the session does too. A failure is never an error response like a
404, because no server answered.

The error's message says what went wrong and names the URL, so you can show it
to a person:

```text
'schemas/person.json' doesn't exist
```

Error messages often end up in logs and bug reports. To keep them from revealing
where your files are, a message shows a `file:` URL relative to the working
directory. The error's `url` has the whole URL. If you want your own messages to
show URLs the same way, use `relativeFileUrl(url)`.

To tell failures apart in code, use the error's `cause.code`:

```typescript
try {
  return await session.fetch(url);
} catch (error) {
  const code = (error as { cause?: { code?: string } }).cause?.code;
  if (code === "ENOENT") {
    // The file doesn't exist
  } else if (code === "ERR_RETRIEVAL_NOT_ALLOWED") {
    // The session's allowRetrieval doesn't allow the URL
  }
  throw error;
}
```

When the system fails, such as the filesystem or the network, `cause` is the
system's error with the system's code. Node.js's own `fetch` gives the reason
the same way. An aborted request rejects with the signal's reason, as it does
with `fetch`, so it isn't a network error.

## Codes

| Code | What failed |
| --- | --- |
| `ERR_RETRIEVAL_NOT_ALLOWED` | The URL, where a redirect leads, or the response's URL isn't in the session's `allowRetrieval`. For more information, see [What a session can fetch](allow-retrieval.md). |
| `ERR_FILE_REFERENCE_NOT_ALLOWED` | A document that isn't a file referred to a `file:` URL. For more information, see [File URLs](file-urls.md#documents-from-the-web). |
| `ERR_UNEXPECTED_REDIRECT` | The response redirected, and the request's `redirect` is `"error"`. |
| `ERR_TOO_MANY_REDIRECTS` | The request redirected more times than the session's `maxRedirects`. |
| `ERR_UNSAFE_REDIRECT` | A redirect led to a scheme that isn't in the session's `redirectSchemes`. For more information, see [Redirects](redirects.md). |
| `ERR_CACHE_MISS` | The request's `cache` is `"only-if-cached"`, and the HTTP cache doesn't have the response. |
| `ERR_UNKNOWN_URL_SCHEME` | The transport doesn't have a fetcher for the URL's scheme. |
| `ERR_METHOD_NOT_SUPPORTED` | A `file:` URL was fetched with a method other than `GET` or `HEAD`. |
| `ERR_OUTSIDE_ROOT` | A `file:` URL is outside the `file:` scheme's `root`. |
| `ERR_NOT_A_FILE` | A `file:` URL is a directory, or something else that isn't a file. |
| `ENOENT`, `EACCES`, and other codes from the filesystem | A file doesn't exist or can't be read. |
| `ENOTFOUND`, `ECONNREFUSED`, and other codes from the runtime | The runtime's `fetch` failed, such as for a host that isn't found or a server that refused the connection. |

A failed request shows in a trace with its message. For more information, see
[Tracing](tracing.md).
