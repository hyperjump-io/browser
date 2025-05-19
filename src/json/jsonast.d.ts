import type { Data, Position } from "unist";


export type JsonNullNode = {
  type: string;
  jsonType: "null";
  value: null;
  data?: Data;
  position?: Position;
};

export type JsonBooleanNode = {
  type: string;
  jsonType: "boolean";
  value: boolean;
  data?: Data;
  position?: Position;
};

export type JsonNumberNode = {
  type: string;
  jsonType: "number";
  value: number;
  data?: Data;
  position?: Position;
};

export type JsonStringNode = {
  type: string;
  jsonType: "string";
  value: string;
  data?: Data;
  position?: Position;
};

export type JsonArrayNode<T = JsonJsonNode> = {
  type: string;
  jsonType: "array";
  children: T[];
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

export type JsonPropertyNode<T = JsonJsonNode> = {
  type: "json-property";
  children: [JsonPropertyNameNode, T];
  data?: Data;
  position?: Position;
};

export type JsonObjectNode<T = JsonJsonNode> = {
  type: string;
  jsonType: "object";
  children: JsonPropertyNode<T>[];
  data?: Data;
  position?: Position;
};

export type JsonNode<A> = JsonObjectNode<A>
  | JsonArrayNode<A>
  | JsonStringNode
  | JsonNumberNode
  | JsonBooleanNode
  | JsonNullNode;

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JsonJsonNullNode extends JsonNullNode {
  type: "json";
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JsonJsonBooleanNode extends JsonBooleanNode {
  type: "json";
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JsonJsonNumberNode extends JsonNumberNode {
  type: "json";
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JsonJsonStringNode extends JsonStringNode {
  type: "json";
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JsonJsonArrayNode extends JsonArrayNode {
  type: "json";
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JsonJsonObjectNode extends JsonObjectNode {
  type: "json";
};

export type JsonJsonNode = JsonJsonObjectNode
  | JsonJsonArrayNode
  | JsonJsonStringNode
  | JsonJsonNumberNode
  | JsonJsonBooleanNode
  | JsonJsonNullNode;

export type JsonType = "null" | "boolean" | "number" | "string" | "array" | "object";

export type JsonDocumentNode = {
  type: "json-document";
  children: JsonJsonNode[];
  data?: Data;
};

export type Json = null | boolean | number | string | Json[] | { [property: string]: Json };
