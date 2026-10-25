# `retrieve` is only for retrieving

`Hyperjump.retrieve` and URI scheme plugins retrieve a resource over a URI
scheme, and nothing else. A document that isn't retrieved, like one an
application keeps in memory, doesn't go through them as a fake response.
An application that finds documents somewhere else overrides `getDocument`.
