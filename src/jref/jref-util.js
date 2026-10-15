import { resolveIri } from "@hyperjump/uri";
import { fromJson } from "../json/jsonast-util.js";

/**
 * @import { JrefNode } from "./jref-ast.js"}
 * @import * as API from "./jref-util.d.ts"
 */

/** @type API.Reviver<any> */
const defaultReviver = (value) => value;

/** @type API.fromJref */
export const fromJref = (jref, uri, reviver = defaultReviver) => {
  return fromJson(jref, uri, (/** @type JrefNode */ node, key) => {
    if (node.jsonType === "object") {
      for (const propertyNode of node.children) {
        if (propertyNode.children[0].value === "$ref") {
          const valueNode = propertyNode.children[1];
          if (valueNode.jsonType === "string") {
            Object.assign(node, {
              type: "reference",
              // Without a base URI, relative references can't be resolved
              href: uri === undefined ? valueNode.value : resolveIri(valueNode.value, uri)
            });
            break;
          }
        }
      }
    }

    return reviver(node, key);
  });
};
