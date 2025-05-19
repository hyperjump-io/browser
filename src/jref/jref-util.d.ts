import { JrefJrefNode, JrefNode } from "./jref-ast.d.ts";


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Reviver<T = JrefNode<any> | undefined> = <A>(node: JrefNode<JrefNode<A>>, key?: string) => T;

/**
 * Parse a JRef string into a JRef AST. Includes a reviver option similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}.
 */
export const fromJref: {
  (json: string, uri: string): JrefJrefNode;
  <R extends Reviver | undefined>(jref: string, uri: string, reviver: R): R extends undefined ? JrefJrefNode : ReturnType<R>;
};
