# Documents aren't trusted

A document shouldn't be able to make an application do something it didn't
choose to, like retrieve an internal address or a file outside the project.
Code is trusted: the application and its plugins.

- Only what the application allows is retrieved, and the default allows
  only what's local to it (see
  [What can be retrieved](../components/allow-retrieval.md)).
- A document from the web can't read files (see
  [The `file:` scheme](../components/file-scheme.md)).
- Request headers are a function of the URL, so credentials only go where
  they belong (see [Request headers](../components/request-headers.md)).
