import type { Data, Position } from "unist";


// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JsonNullNode {
  type: "json";
  jsonType: "null";
  value: null;
  data?: Data;
  position?: Position;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JsonBooleanNode {
  type: "json";
  jsonType: "boolean";
  value: boolean;
  data?: Data;
  position?: Position;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JsonNumberNode {
  type: "json";
  jsonType: "number";
  value: number;
  data?: Data;
  position?: Position;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JsonStringNode {
  type: "json";
  jsonType: "string";
  value: string;
  data?: Data;
  position?: Position;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JsonArrayNode<T = JsonNode> {
  type: "json";
  jsonType: "array";
  children: T[];
  data?: Data;
  position?: Position;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JsonPropertyNameNode {
  type: "json-property-name";
  value: string;
  data?: Data;
  position?: Position;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JsonPropertyNode<T = JsonNode> {
  type: "json-property";
  children: [JsonPropertyNameNode, T];
  data?: Data;
  position?: Position;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JsonObjectNode<T = JsonNode> {
  type: "json";
  jsonType: "object";
  children: JsonPropertyNode<T>[];
  data?: Data;
  position?: Position;
};

type JsonNode = JsonObjectNode
  | JsonArrayNode
  | JsonStringNode
  | JsonNumberNode
  | JsonBooleanNode
  | JsonNullNode;

export type JsonDocumentNode = {
  type: "json-document";
  children: JsonNode[];
  data?: Data;
};
