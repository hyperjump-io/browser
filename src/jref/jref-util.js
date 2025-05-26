import { resolveIri } from "@hyperjump/uri";
import { fromJson } from "../json/jsonast-util.js";

/**
 * @import { JrefJrefNode, JrefNode } from "./jref-ast.d.ts"
 * @import * as API from "./jref-util.d.ts"
 */


/** @type API.Reviver<any, any> */
const defaultReviver = (value) => value;

/**
 * @template [A={ type: "jref" }]
 * @template {JrefNode<A> | undefined} [B=JrefNode<A>]
 *
 * @overload
 * @param {string} jref
 * @param {string} uri
 * @returns {JrefJrefNode}
 *
 * @overload
 * @param {string} jref
 * @param {string} uri
 * @param {API.Reviver<A>} reviver
 * @returns {JrefNode<any> | undefined}
 *
 * @param {string} jref
 * @param {string} uri
 * @param {API.Reviver<A, B>} [reviver]
 * @returns {JrefJrefNode | JrefNode<A> | undefined}
 *
 * @type API.fromJref
 */
export const fromJref = (jref, uri, reviver = defaultReviver) => {
  return fromJson(jref, uri, (node, key) => {
    const jrefNode = /** @type API.ParsedJrefNode<A & ({ jrefType: "json" } | { jrefType: "reference"; href: string })> */ ({
      ...node,
      type: "jref",
      jrefType: "json"
    });

    if (jrefNode.jsonType === "object") {
      for (const propertyNode of jrefNode.children) {
        if (propertyNode.children[0].value === "$ref") {
          const valueNode = propertyNode.children[1];
          if (valueNode.jsonType === "string") {
            Object.assign(jrefNode, {
              jrefType: "reference",
              href: resolveIri(valueNode.value, uri)
            });
            break;
          }
        }
      }
    }

    return reviver(jrefNode, key);
  });
};
