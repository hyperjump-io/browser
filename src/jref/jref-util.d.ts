import { JrefCompatible, JrefNode } from "./jref-ast.d.ts";


export type Reviver<A extends JrefNode | undefined> = (node: JrefCompatible<NonNullable<A>>, key?: string) => A;

/**
 * Parse a JRef string into a JRef AST. Includes a reviver option similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}.
 */
export const fromJref: <A extends JrefNode | undefined = JrefNode>(jref: string, uri: string, reviver?: Reviver<A>) => A;

export type Replacer = (value: JrefNode, key?: string) => JrefNode | undefined;

/**
 * Stringify a JrefNode to a JRef string. Includes options for a
 * {@link Replacer} and `space` like
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify | JSON.stringify}.
 */
export const toJref: (node: JrefNode, uri: string, replacer?: Replacer, space?: string) => string;

/**
 * Index into an object or array JrefNode. Reference nodes are not followed.
 *
 * @throws {@link json.JsonPointerError}
 */
export const pointerStep: (segment: string, tree: JrefNode, uri?: string) => JrefNode;

/**
 * Get a JrefNode using a JSON Pointer. Reference nodes are not followed.
 */
export const pointerGet: (pointer: string, tree: JrefNode, documentUri?: string) => JrefNode;
