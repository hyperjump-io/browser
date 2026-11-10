# Browser

The Hyperjump browser is a `fetch` inspired by web browsers. Requests belong to
a session, the way the requests of a page load do. Each request goes through a
stack of layers, such as an HTTP cache, and ends at a transport that retrieves
it by its URL scheme. On a server, that includes `file:` URLs.

## Contents

- [Install](install.md): install in Node.js and browsers
