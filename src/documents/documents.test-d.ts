// What a session's type says about its documents. It's only type-checked.
import { defaultMediaTypes, get, Hyperjump, jrefMediaType, jrefSelect, jrefSelectAll } from "../index.js";
import type { DocumentNode, FollowedNode, HyperjumpConfig, JrefMediaTypeDocument, JrefNode, JsonMediaTypeDocument, JsonNode, MediaTypePlugin, Target } from "../index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const yes = <T extends true>(_is?: T) => {};

// A session created without media types has the defaults
const defaults = new Hyperjump({ allowRetrieval: [] });
type DefaultDocument = JrefMediaTypeDocument | JsonMediaTypeDocument;
const target = await get(defaults, "https://example.com/");
yes<Equal<typeof target, Target<DefaultDocument, FollowedNode<JrefNode | JsonNode>>>>();
const fromNone = (await get(new Hyperjump(), "https://example.com/", { reference: "manual" })).document;
yes<Equal<typeof fromNone, DefaultDocument>>();
const fromUndefined = await get(new Hyperjump({ mediaTypes: undefined }), "https://example.com/");
yes<Equal<typeof fromUndefined, Target<DefaultDocument, FollowedNode<JrefNode | JsonNode>>>>();

// A session that's only known as a `Hyperjump`, or whose configuration is
// only known as a `HyperjumpConfig`, could have any
declare const any: Hyperjump;
const fromAny = await get(any, "https://example.com/");
yes<Equal<typeof fromAny, Target>>();
declare const config: HyperjumpConfig;
const fromConfig = await get(new Hyperjump(config), "https://example.com/");
yes<Equal<typeof fromConfig, Target>>();

// Media types that might not be there are theirs or the defaults
declare const maybe: { mediaTypes?: [typeof jrefMediaType] };
const fromMaybe = (await get(new Hyperjump(maybe), "https://example.com/", { reference: "manual" })).document;
yes<Equal<typeof fromMaybe, DefaultDocument>>();

// A reference can lead to a document in any of a session's media types
type OtherNode = JsonNode<{ type: "other" } | { type: "reference"; href: string }>;
declare const otherMediaType: MediaTypePlugin<DocumentNode<OtherNode>>;
const both = new Hyperjump({ mediaTypes: [...defaultMediaTypes, otherMediaType] });
const either = await get(both, "https://example.com/");
type EitherDocument = DefaultDocument | DocumentNode<OtherNode>;
type EitherNode = FollowedNode<JrefNode | JsonNode | OtherNode>;
yes<Equal<typeof either, Target<EitherDocument, EitherNode>>>();
const document = (await get(both, "https://example.com/", { reference: "manual" })).document;
yes<Equal<typeof document, EitherDocument>>();

// A plugin that doesn't say what its documents are
declare const loose: MediaTypePlugin;
const unknownNode = await get(new Hyperjump({ mediaTypes: [jrefMediaType, loose] }), "https://example.com/");
yes<Equal<typeof unknownNode, Target>>();

// Browsing takes a target with a node of any tree, and gives a target
// with a node of that tree or of any of the session's
declare const other: Target<DocumentNode<OtherNode>, FollowedNode<OtherNode>>;
const selected = await jrefSelect(both, "> [key=a]", other);
yes<Equal<typeof selected, Target<EitherDocument, EitherNode> | undefined>>();
const fromDefaults = await jrefSelect(defaults, "> [key=a]", other);
yes<Equal<typeof fromDefaults, Target<EitherDocument, EitherNode> | undefined>>();
declare const object: Target<DocumentNode<OtherNode>, Extract<FollowedNode<OtherNode>, { jsonType: "object" }>>;
// A narrowed node's values are any node of its tree
for (const value of await jrefSelectAll(both, "> *", object)) {
  yes<Equal<typeof value, Target<EitherDocument, EitherNode>>>();
}

// A walk follows a reference it starts at, so a target whose node could be
// one gives what its tree's values and the session's documents are
declare const unfollowed: Target<DocumentNode<OtherNode>, OtherNode>;
const fromUnfollowed = await jrefSelect(both, ":root", unfollowed);
yes<Equal<typeof fromUnfollowed, Target<EitherDocument, EitherNode> | undefined>>();

// A reference is followed from a target, not from a node
await get(both, "https://example.com/", { referencedFrom: other });
// @ts-expect-error A node isn't a target
await get(both, "https://example.com/", { referencedFrom: other.node });

// With `reference: "manual"`, the target's node can be a reference
const written = await get(defaults, "https://example.com/", { reference: "manual" });
yes<Equal<typeof written.node, JrefNode | JsonNode>>();
const followed = await get(defaults, "https://example.com/", { reference: "follow" });
yes<Equal<typeof followed.node, FollowedNode<JrefNode | JsonNode>>>();
declare const followOrNot: "follow" | "manual";
const maybeWritten = await get(defaults, "https://example.com/", { reference: followOrNot });
yes<Equal<typeof maybeWritten.node, JrefNode | JsonNode>>();
