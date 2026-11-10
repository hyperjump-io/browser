# Types

- The API is declared in hand-written `.d.ts` files next to the JS, and the
  JS is typed with JSDoc. Type-checking (`npm run type-check`) includes the
  declaration files. Only TypeScript's built-in library files are skipped.
- A class implements its declaration (`@implements API.Session`) and a
  method or function takes its type from it (`@type API.Session["fetch"]`),
  so the documentation is written once, in the `.d.ts`.
- Docs are inherited by applications' layers and subclasses, which can only
  resolve links TypeScript resolves. Linked types are imported instead of
  named by module, and `@throws` tags don't start with a link, because
  TypeScript reads that as a type.
