# Browser

The Hyperjump browser is a `fetch` inspired by web browsers. Requests belong to
a session, the way the requests of a page load do. Each request goes through a
stack of layers, such as an HTTP cache, and ends at a transport that retrieves
it by its URL scheme. On a server, that includes `file:` URLs.

## Contents

- [Install](install.md): install in Node.js and browsers
- [Sessions](sessions.md): fetch through a session, close it, and nest sessions
- [Layers](layers.md): build a stack and write your own layers
- [File URLs](file-urls.md): fetch `file:` URLs on a server
- [Registry](registry.md): answer requests with documents you already have
- [Resource map](resource-map.md): answer requests with resources found while loading
