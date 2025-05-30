import type { JrefNode } from "./jref-ast.d.ts";

export type Reviver<A extends JrefNode | undefined> = (node: JrefNode, key?: string) => A;

/**
 * Parse a JRef string into a JRef AST. Includes a reviver option similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}.
 */
export const fromJref: <A extends JrefNode | undefined = JrefNode>(json: string, uri: string, reviver?: Reviver<A>) => A;
