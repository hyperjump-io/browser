import type { Data } from "unist";
import type { JsonNode } from "../json/jsonast.d.ts";

export type JrefNode<A> = JsonNode<A & (
  {
    jrefType: "json";
  } | {
    jrefType: "reference";
    href: string;
  }
)>;

export type JrefJrefNode = JrefNode<{ type: "jref" }>;

export type JrefDocumentNode = {
  type: "jref-document";
  children: JrefNode<{}>[];
  uri: string;
  fragmentKind: "json-pointer";
  data?: Data;
};
