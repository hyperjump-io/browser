import type {
  JsonArrayNode,
  JsonBooleanNode,
  JsonNullNode,
  JsonNumberNode,
  JsonObjectNode,
  JsonStringNode
} from "../json/jsonast.js";
import type { JrefNode } from "./jref-ast.d.ts";

export type ParsedJrefNode<A> = {
  type: "jref";
} & (
  {
    jrefType: "json";
  } | {
    jrefType: "reference";
    href: string;
  }
) & (
  JsonObjectNode<JrefNode<A>>
  | JsonArrayNode<JrefNode<A>>
  | JsonStringNode
  | JsonNumberNode
  | JsonBooleanNode
  | JsonNullNode
);

export type Reviver<A, R extends JrefNode<A> | undefined> = (node: ParsedJrefNode<A>, key?: string) => R;

/**
 * Parse a JRef string into a JRef AST. Includes a reviver option similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}.
 */
export const fromJref: <A = { type: "jref" }, R = JrefNode<A>>(json: string, uri: string, reviver?: Reviver<A, R>) => R;
