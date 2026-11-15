import type { Browsable, Reachable, WalkOptions } from "./browsing.d.ts";
import type { DocumentSession } from "./documents.d.ts";
import type { AnyJsonNode } from "../json/jsonast-util.d.ts";

/**
 * The first node under `node`, or `node` itself, that matches a selector in
 * the tree with its references followed, like `unist-util-select`'s
 * `select`. It's `undefined` if nothing matches.
 *
 * A selector is a comma-separated list of selectors made of these, joined
 * by ` ` (a descendant) or `>` (a child):
 *
 * - A `type`, like `json`, or `*` for any
 * - `[name]` for a node that has a property, or `[name=value]` for one whose
 *   property is the value compared as a string, like `[jsonType=object]` or
 *   `[value=42]`. A value with characters other than letters, digits, `_`,
 *   `-`, and `$` is quoted, like `[key="a b"]`.
 * - `[key=name]` for the value at a property name or array index, like
 *   `[key=director]` or `[key=0]`
 * - `:root` or `:scope` for `node`. A selector that starts with `>` starts
 *   at `node`, so `> [key=director]` is `:root > [key=director]`.
 *
 * Only what a selector could match is followed. A member that a child
 * selector's `[key=...]` rules out isn't retrieved, and `jrefSelect` stops
 * at the first match. A descendant selector, like `[key=name]` on its own,
 * can match anywhere, so it follows every reference under `node`. A
 * reference back to a node that's being walked can match, but what's under
 * it isn't walked again.
 *
 * @throws An `Error` whose `cause.code` is `ERR_MAX_DEPTH` if something
 * more than {@link WalkOptions.maxDepth} levels below `node` could match.
 * Its `url` is the node the walk would go under.
 * @throws A `SyntaxError` if the selector isn't one, or uses something that
 * isn't supported, like `:has()` or `+`.
 * @throws A `RangeError` if `maxDepth` isn't valid.
 * @throws What `get` throws, if it follows a reference.
 */
export const jrefSelect: <S extends DocumentSession, N extends AnyJsonNode>(session: S, selector: string, node: N & Browsable<N>, options?: WalkOptions) => Promise<Reachable<S, N> | undefined>;

/**
 * Every node under `node`, and `node` itself, that matches a selector, like
 * `unist-util-select`'s `selectAll`. They're in the order they're reached,
 * each once even if it's reached through more than one reference.
 * Selectors are {@link jrefSelect}'s.
 *
 * @throws An `Error` whose `cause.code` is `ERR_MAX_DEPTH` if something
 * more than {@link WalkOptions.maxDepth} levels below `node` could match.
 * Its `url` is the node the walk would go under.
 * @throws A `SyntaxError` if the selector isn't one, or uses something that
 * isn't supported, like `:has()` or `+`.
 * @throws A `RangeError` if `maxDepth` isn't valid.
 * @throws What `get` throws, if it follows a reference.
 */
export const jrefSelectAll: <S extends DocumentSession, N extends AnyJsonNode>(session: S, selector: string, node: N & Browsable<N>, options?: WalkOptions) => Promise<Reachable<S, N>[]>;
