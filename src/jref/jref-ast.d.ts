import type { Data } from "unist";
import type { JsonNode } from "../json/jsonast.d.ts";

export type JrefNode = JsonNode<{
  type: "json";
} | {
  type: "reference";
  href: string;
}>;

export type JrefDocumentNode = {
  type: "jref-document";
  children: JrefNode[];
  uri: string;
  fragmentKind: "json-pointer";
  data?: Data;
};
