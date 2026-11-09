import type { Data } from "unist";
import type { JsonCommentNode, JsonErrorNode, JsonNode, JsonObjectNode, JsonParseStatus, JsonStatusChildren } from "../json/jsonast.d.ts";

type JrefAnnotations = {
  type: "json";
} | {
  type: "reference";
  /** Resolved against the document's URL */
  href: string;
};

/**
 * A JRef value. `X` works the same way as it does for `JsonNode`.
 */
export type JrefNode<X = never> = JsonNode<JrefAnnotations, X>;

/**
 * An object whose `$ref` is a string that doesn't resolve to a URL against
 * the document's URL. It's still an
 * object, with its properties. Only a parse whose status is `failure`
 * produces these.
 */
export interface JrefInvalidReferenceNode extends JsonObjectNode<JrefAnnotations, JrefErrorNode> {
  type: "invalid-reference";
}

/**
 * The nodes a JRef parse uses in place of a value it couldn't recover or a
 * reference that isn't valid.
 */
export type JrefErrorNode = JsonErrorNode | JrefInvalidReferenceNode;

/**
 * A JRef value from a parse whose status is `failure`.
 */
export type JrefTolerantNode = JrefNode<JrefErrorNode>;

/**
 * A JRef document. `S` works the same way as it does for `JsonDocumentNode`.
 */
export type JrefDocumentNode<S extends JsonParseStatus = JsonParseStatus> = {
  type: "jref-document";
  status: S;
  children: JsonStatusChildren<S, JrefNode, JrefTolerantNode | JrefInvalidReferenceNode>;
  /** See `JsonDocumentNode` */
  comments: JsonCommentNode[];
  url: string;
  data?: Data;
};
