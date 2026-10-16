import type { Data } from "unist";
import type { JsonCommentNode, JsonErrorNode, JsonNode, JsonParseStatus, JsonStatusChildren } from "../json/jsonast.d.ts";

/**
 * A JRef value. `X` works the same way as it does for `JsonNode`.
 */
export type JrefNode<X = never> = JsonNode<{
  type: "json";
} | {
  type: "reference";
  href: string;
}, X>;

/**
 * A JRef value from a parse whose status is `failure`.
 */
export type JrefTolerantNode = JrefNode<JsonErrorNode>;

/**
 * A JRef document. `S` works the same way as it does for `JsonDocumentNode`.
 */
export type JrefDocumentNode<S extends JsonParseStatus = JsonParseStatus> = {
  type: "jref-document";
  status: S;
  children: JsonStatusChildren<S, JrefNode, JrefTolerantNode>;
  /** See `JsonDocumentNode` */
  comments: JsonCommentNode[];
  uri?: string;
  fragmentKind: "json-pointer";
  data?: Data;
};
