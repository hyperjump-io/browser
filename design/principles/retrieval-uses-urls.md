# Retrieval uses URLs

What's retrieved is a URL, so retrieval uses WHATWG URLs (`new URL`,
`pathToFileURL`). `@hyperjump/uri` is for what URLs don't do, like
resolving IRIs and encoding locations. Applications that identify
documents by URIs that aren't URLs handle that themselves.
