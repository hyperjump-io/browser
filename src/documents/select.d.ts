import type { Browsable, JrefTestedNode, Reachable, WalkOptions } from "./browsing.d.ts";
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
 * What's selected is narrowed by a `[jsonType=...]` in the last part of a
 * selector, like `> [key=title][jsonType=string]`, so it's a string node
 * whose `value` is a string (see {@link Selected}).
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
export const jrefSelect: <S extends DocumentSession, N extends AnyJsonNode, L extends string>(session: S, selector: L, node: N & Browsable<N>, options?: WalkOptions) => Promise<Selected<Reachable<S, N>, L> | undefined>;

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
export const jrefSelectAll: <S extends DocumentSession, N extends AnyJsonNode, L extends string>(session: S, selector: L, node: N & Browsable<N>, options?: WalkOptions) => Promise<Selected<Reachable<S, N>, L>[]>;

/**
 * The nodes of type `N` that selector list `L` can select. A selector is
 * narrowed by the `[jsonType=...]` attributes of its last compound, the
 * part after its last combinator, which is the part that matches what's
 * selected. A list is the nodes any of its selectors can select. A selector
 * that isn't a string literal, or isn't one these types can read, isn't
 * narrowed.
 *
 * Only `jsonType` narrows, because it's the only property whose values are
 * known for every media type's nodes. Values are compared as strings, so
 * `[jsonType=foo]`, or two `jsonType`s in one compound, selects `never`.
 */
export type Selected<N, L extends string> = string extends L ? N
  : SelectedByJsonTypes<N, SelectorJsonTypes<L>>;

/** A selector that isn't narrowed selects any of `N` */
type SelectedByJsonTypes<N, T> = [string] extends T ? N : NarrowByJsonTypes<N, T>;

/**
 * `N` narrowed by each selector's `jsonType`, a `[string]` for a selector
 * that doesn't have one
 */
type NarrowByJsonTypes<N, T> = T extends [infer J extends string]
  ? [J] extends [never] ? never : string extends J ? N : JrefTestedNode<N, { jsonType: J }>
  : never;

// A selector is read in chunks between attributes, so it takes a step for
// each attribute and a step for each character of a quoted value. Each is
// tail recursive, so a selector can be about 1000 of them long. Quotes,
// brackets, commas, and whitespace in a quoted value are only read as the
// value's.
//
// `Current` is the jsonType the selector being read has to have so far:
// `string` for any, and `never` for two that are different. `Done` is a
// union with a `[jsonType]` for each selector already read. A selector that
// isn't valid is a SyntaxError when it's called, so what it narrows to
// doesn't matter, but it's never narrower than what's valid.

type Whitespace = " " | "\t" | "\n" | "\r" | "\f";
type Combinator = Whitespace | ">";

type TrimStart<S extends string> = S extends `${Whitespace}${infer R}` ? TrimStart<R> : S;
type TrimEnd<S extends string> = S extends `${infer R}${Whitespace}` ? TrimEnd<R> : S;

/**
 * What's before the first attribute of the rest of a selector list, or
 * after the last one
 */
type SelectorJsonTypes<L extends string, Current extends string = string, Done = never>
  = L extends `${infer Before}[${infer Attribute}`
    ? ReadAttribute<Attribute, AfterText<Before, Current>, Done | DoneInText<Before, Current>>
    : Done | DoneInText<L, Current> | [AfterText<L, Current>];

/**
 * The jsonType of the selector that's being read after `Text`, which has
 * no attributes. A combinator before more of the selector starts a new
 * compound, and a comma a new selector.
 */
type AfterText<Text extends string, Current extends string>
  = Text extends `${string},${infer Rest}` ? AfterText<Rest, string>
    : TrimEnd<Text> extends `${string}${Combinator}${string}` ? string
      : Current;

/** A `[jsonType]` for each selector that ends in `Text` */
type DoneInText<Text extends string, Current extends string>
  = Text extends `${infer First},${infer Rest}`
    ? [AfterText<First, Current>] | (Rest extends `${string},${string}` ? [string] : never)
    : never;

/** The attribute after a `[`, and the rest of the selector list after it */
type ReadAttribute<A extends string, Current extends string, Done>
  = A extends `${infer Name}=${infer Value}`
    ? Name extends `${string}]${string}`
      ? ReadNameOnly<A, Current, Done>
      : ReadValue<TrimStart<Value>, TrimEnd<TrimStart<Name>>, Current, Done>
    : ReadNameOnly<A, Current, Done>;

/** `[name]` matches whatever the value, so it doesn't narrow */
type ReadNameOnly<A extends string, Current extends string, Done>
  = A extends `${string}]${infer Rest}` ? SelectorJsonTypes<Rest, Current, Done> : [string];

type ReadValue<V extends string, Name extends string, Current extends string, Done>
  = V extends `${infer Quote extends "\"" | "'"}${infer Rest}`
    ? ReadQuoted<Rest, Quote, "", Name, Current, Done>
    : V extends `${infer Value}]${infer Rest}`
      ? SelectorJsonTypes<Rest, WithAttribute<Name, TrimEnd<Value>, Current>, Done>
      : [string];

/** A quoted value one character at a time, for its escapes */
type ReadQuoted<V extends string, Quote extends string, Value extends string, Name extends string, Current extends string, Done>
  = V extends `${Quote}${infer Rest}`
    ? TrimStart<Rest> extends `]${infer After}`
      ? SelectorJsonTypes<After, WithAttribute<Name, Value, Current>, Done>
      : [string]
    : V extends `\\${infer Character}${infer Rest}`
      ? ReadQuoted<Rest, Quote, `${Value}${Character}`, Name, Current, Done>
      : V extends `${infer Character}${infer Rest}`
        ? ReadQuoted<Rest, Quote, `${Value}${Character}`, Name, Current, Done>
        : [string];

type WithAttribute<Name extends string, Value extends string, Current extends string>
  = Name extends "jsonType" ? Current & Value : Current;
