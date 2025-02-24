import {
  JsonArrayNode,
  JsonBooleanNode,
  JsonCompatible,
  JsonNullNode,
  JsonNumberNode,
  JsonObjectNode,
  JsonStringNode
} from "./jsonast.d.ts";


export type JsonTypeOf = (
  (<A>(node: JsonCompatible<A>, type: "null") => node is JsonNullNode) &
  (<A>(node: JsonCompatible<A>, type: "boolean") => node is JsonBooleanNode) &
  (<A>(node: JsonCompatible<A>, type: "number") => node is JsonNumberNode) &
  (<A>(node: JsonCompatible<A>, type: "string") => node is JsonStringNode) &
  (<A>(node: JsonCompatible<A>, type: "array") => node is JsonArrayNode<A>) &
  (<A>(node: JsonCompatible<A>, type: "object") => node is JsonObjectNode<A>)
);

export type JsonValue = (
  (<_A>(node: JsonNullNode) => null) &
  (<_A>(node: JsonBooleanNode) => boolean) &
  (<_A>(node: JsonNumberNode) => number) &
  (<_A>(node: JsonStringNode) => string) &
  (<A>(node: JsonArrayNode<A>) => unknown[]) &
  (<A>(node: JsonObjectNode<A>) => Record<string, unknown>) &
  (<A>(node: JsonCompatible<A>) => unknown)
);
