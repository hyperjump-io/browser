import {
  JsonArrayNode,
  JsonBooleanNode,
  JsonNode,
  JsonNullNode,
  JsonNumberNode,
  JsonObjectNode,
  JsonStringNode
} from "./jsonast.d.ts";

export type JsonTypeOf = (
  ((node: JsonNode, type: "null") => node is JsonNullNode) &
  ((node: JsonNode, type: "boolean") => node is JsonBooleanNode) &
  ((node: JsonNode, type: "number") => node is JsonNumberNode) &
  ((node: JsonNode, type: "string") => node is JsonStringNode) &
  ((node: JsonNode, type: "array") => node is JsonArrayNode) &
  ((node: JsonNode, type: "object") => node is JsonObjectNode)
);

export type JsonValue = (
  ((node: JsonNullNode) => null) &
  ((node: JsonBooleanNode) => boolean) &
  ((node: JsonNumberNode) => number) &
  ((node: JsonStringNode) => string) &
  ((node: JsonArrayNode) => unknown[]) &
  ((node: JsonObjectNode) => Record<string, unknown>) &
  ((node: JsonNode) => unknown)
);
