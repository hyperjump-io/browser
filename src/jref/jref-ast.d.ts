import type { Data } from "unist";
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
  jrefType: "jref-reference";
  href: string;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JrefJsonNullNode extends JsonNullNode {
  type: "jref";
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JrefJsonBooleanNode extends JsonBooleanNode {
  type: "jref";
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JrefJsonNumberNode extends JsonNumberNode {
  type: "jref";
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JrefJsonStringNode extends JsonStringNode {
  type: "jref";
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JrefJsonArrayNode extends JsonArrayNode<JrefJrefNode> {
  type: "jref";
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JrefJsonObjectNode extends JsonObjectNode<JrefJrefNode> {
  type: "jref";
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface JrefJrefReferenceNode extends JrefReferenceNode, JsonObjectNode<JrefJrefNode> {
  type: "jref";
};

export type JrefNode<A> = JsonObjectNode<A>
  | JsonArrayNode<A>
  | JsonStringNode
  | JsonNumberNode
  | JsonBooleanNode
  | JsonNullNode
  | (JrefReferenceNode & JsonObjectNode<A>);

export type JrefJrefNode = JrefJsonObjectNode
  | JrefJsonArrayNode
  | JrefJsonStringNode
  | JrefJsonNumberNode
  | JrefJsonBooleanNode
  | JrefJsonNullNode
  | JrefJrefReferenceNode;

export type JrefDocumentNode = {
  type: "jref-document";
  children: JrefJrefNode[];
  uri: string;
  fragmentKind: "json-pointer";
  data?: Data;
};
