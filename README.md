# Hyperjump - Browser

## Install
Includes support for node.js (ES Modules, TypeScript) and browsers.

### Node.js
```bash
npm install @hyperjump/browser
```

### Browser
When in a browser context, this library is designed to use the browser's `fetch`
implementation instead of a node.js fetch clone. The Webpack bundler does this
properly without any extra configuration, but if you are using the Rollup
bundler you will need to include the `browser: true` option in your Rollup
configuration.

```javascript
  plugins: [
    resolve({
      browser: true
    })
  ]
```

## JRef
Parse and stringify JRef values using the same API as the `JSON` built-in
functions including reviver and replacer functions.

```javascript
import { parse, stringify, Reference } from "@hyperjump/browser/jref";

const blogPostJref = `{
  "title": "Working with JRef",
  "author": { "$href": "/author/jdesrosiers" },
  "content": "lorem ipsum dolor sit amet",
}`;
const blogPost = parse(blogPostJref);
blogPost.author instanceof Reference; // => true
blogPost.author.href; // => "/author/jdesrosiers"

stringify(blogPost, null, "  ") === blogPostJref // => true
```

## Contributing

### Tests

Run the tests

```bash
npm test
```

Run the tests with a continuous test runner

```bash
npm test -- --watch
```
