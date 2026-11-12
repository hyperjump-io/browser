# Parsing never fails

Editors parse documents while they're being typed, so a document that
isn't valid still has a tree, with positions, and every syntax error is
reported at once. Parsing never throws. The caller decides how bad is too
bad (the unified plugins' `accept` option), and the types say which trees
can have nodes that couldn't be parsed (see
[The JSON AST](../components/json-ast.md)).
