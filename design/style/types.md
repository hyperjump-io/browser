# Types

- The API is declared in hand-written `.d.ts` files next to the JS, and the
  JS is typed with JSDoc. Type-checking (`npm run type-check`) includes the
  declaration files. Only TypeScript's built-in libs are skipped.
- Docs are inherited by other packages, like an application's subclasses
  of `Hyperjump` and `Session`, which can only resolve links TypeScript
  resolves. Linked types are imported instead of named by module, and
  `@throws` tags don't start with a link, because TypeScript reads that as
  a type.
