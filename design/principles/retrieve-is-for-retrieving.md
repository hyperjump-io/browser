# `retrieve` is only for retrieving

URL scheme plugins, and the `retrieve` they're given for a scheme that maps
to another URL, retrieve a resource over a URL scheme, and nothing else. A document that isn't retrieved, like one an
application keeps in memory, doesn't go through them as a fake response.
An application that finds documents somewhere else overrides `getDocument`.
