import type { Data, Position } from "unist";


export type JsonNullNode = {
  type: string;
  jsonType: "null";
  value: null;
  location: string;
  data?: Data;
  position?: Position;
};

export type JsonBooleanNode = {
  type: string;
  jsonType: "boolean";
  value: boolean;
  location: string;
  data?: Data;
  position?: Position;
};

export type JsonNumberNode = {
  type: string;
  jsonType: "number";
  value: number;
  location: string;
  data?: Data;
  position?: Position;
};

export type JsonStringNode = {
  type: string;
  jsonType: "string";
  value: string;
  location: string;
  data?: Data;
  position?: Position;
};

export type JsonArrayNode<T> = {
  type: string;
  jsonType: "array";
  children: JsonNode<T>[];
  location: string;
  data?: Data;
  position?: Position;
};

export type JsonPropertyNameNode = {
  type: "json-property-name";
  jsonType: "string";
  value: string;
  data?: Data;
  position?: Position;
};

export type JsonPropertyNode<T> = {
  type: "json-property";
  children: [JsonPropertyNameNode, JsonNode<T>];
  data?: Data;
  position?: Position;
};

export type JsonObjectNode<T> = {
  type: string;
  jsonType: "object";
  children: JsonPropertyNode<T>[];
  location: string;
  data?: Data;
  position?: Position;
};

export type JsonNode<A = { type: "json" }> = A & (
  JsonObjectNode<A>
  | JsonArrayNode<A>
  | JsonStringNode
  | JsonNumberNode
  | JsonBooleanNode
  | JsonNullNode
);

export type JsonType = "null" | "boolean" | "number" | "string" | "array" | "object";

export type JsonDocumentNode = {
  type: "json-document";
  children: JsonNode[];
  data?: Data;
};

export type Json = null | boolean | number | string | Json[] | { [property: string]: Json };
