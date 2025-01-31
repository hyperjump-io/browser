import type { Data, Position } from "unist";
import {
  JsonArrayNode,
  JsonBooleanNode,
  JsonNullNode,
  JsonNumberNode,
  JsonObjectNode,
  JsonStringNode
} from "../json/jsonast.d.ts";


// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JrefReferenceNode {
  type: "jref-reference";
  value: string;
  data?: Data;
  position?: Position;
};

export type JrefNode = JsonObjectNode<JrefNode>
  | JsonArrayNode<JrefNode>
  | JsonStringNode
  | JsonNumberNode
  | JsonBooleanNode
  | JsonNullNode
  | JrefReferenceNode;

export type JrefDocumentNode = {
  type: "jref-document";
  children: JrefNode[];
  uri: string;
  fragmentKind: "json-pointer";
  data?: Data;
};
