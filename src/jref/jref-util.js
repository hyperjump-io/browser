import { resolveIri } from "@hyperjump/uri";
import { fromJson, hasStatus as jsonHasStatus } from "../json/jsonast-util.js";

/**
 * @import { JsonErrorNode } from "../json/jsonast.js"
 * @import { JrefNode } from "./jref-ast.js"
 * @import * as API from "./jref-util.d.ts"
 */

/** @type API.Reviver<any, any> */
const defaultReviver = (value) => value;

// eslint-disable-next-line @stylistic/no-extra-parens
export const hasStatus = /** @type API.hasStatus */ (jsonHasStatus);

/** @type API.fromJref */
export const fromJref = (jref, uri, reviver = defaultReviver, options = {}) => {
  return /** @type any */ (fromJson(jref, uri, jrefReviver(uri, reviver), options));
};

/** @type (uri: string | undefined, reviver: (node: any, key?: string) => any) => (node: any, key?: string) => any */
const jrefReviver = (uri, reviver) => (/** @type JrefNode<JsonErrorNode> */ node, key) => {
  if (node.jsonType === "object") {
    for (const propertyNode of node.children) {
      const [keyNode, valueNode] = propertyNode.children;
      if (keyNode.value === "$ref" && "jsonType" in valueNode && valueNode.jsonType === "string") {
        Object.assign(node, {
          type: "reference",
          // Without a base URI, relative references can't be resolved
          href: uri === undefined ? valueNode.value : resolveIri(valueNode.value, uri)
        });
        break;
      }
    }
  }

  return reviver(node, key);
};
