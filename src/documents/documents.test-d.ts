// What a session's type says about its documents. It's only type-checked.
import { defaultMediaTypes, get, getDocument, Hyperjump, jrefMediaType, jrefSelect, jrefSelectAll } from "../index.js";
import type { DocumentNode, FollowedNode, HyperjumpConfig, JrefMediaTypeDocument, JrefNode, JsonMediaTypeDocument, JsonNode, MediaTypePlugin } from "../index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const yes = <T extends true>(_is?: T) => {};

// A session created without media types has the defaults
const defaults = new Hyperjump({ allowRetrieval: [] });
const node = await get(defaults, "https://example.com/");
yes<Equal<typeof node, FollowedNode<JrefNode | JsonNode>>>();
const fromNone = await getDocument(new Hyperjump(), "https://example.com/");
yes<Equal<typeof fromNone, JrefMediaTypeDocument | JsonMediaTypeDocument>>();
const fromUndefined = await get(new Hyperjump({ mediaTypes: undefined }), "https://example.com/");
yes<Equal<typeof fromUndefined, FollowedNode<JrefNode | JsonNode>>>();

// A session that's only known as a `Hyperjump`, or whose configuration is
// only known as a `HyperjumpConfig`, could have any
declare const any: Hyperjump;
const fromAny = await get(any, "https://example.com/");
yes<Equal<typeof fromAny, unknown>>();
declare const config: HyperjumpConfig;
const fromConfig = await get(new Hyperjump(config), "https://example.com/");
yes<Equal<typeof fromConfig, unknown>>();

// Media types that might not be there are theirs or the defaults
declare const maybe: { mediaTypes?: [typeof jrefMediaType] };
const fromMaybe = await getDocument(new Hyperjump(maybe), "https://example.com/");
yes<Equal<typeof fromMaybe, JrefMediaTypeDocument | JsonMediaTypeDocument>>();

// A reference can lead to a document in any of a session's media types
type OtherNode = JsonNode<{ type: "other" } | { type: "reference"; href: string }>;
declare const otherMediaType: MediaTypePlugin<DocumentNode<OtherNode>>;
const both = new Hyperjump({ mediaTypes: [...defaultMediaTypes, otherMediaType] });
const either = await get(both, "https://example.com/");
yes<Equal<typeof either, FollowedNode<JrefNode | JsonNode | OtherNode>>>();
const document = await getDocument(both, "https://example.com/");
yes<Equal<typeof document, JrefMediaTypeDocument | JsonMediaTypeDocument | DocumentNode<OtherNode>>>();

// A plugin that doesn't say what its documents are
declare const loose: MediaTypePlugin;
const unknownNode = await get(new Hyperjump({ mediaTypes: [jrefMediaType, loose] }), "https://example.com/");
yes<Equal<typeof unknownNode, unknown>>();

// Browsing takes a node of any tree, and gives a node of that tree or of
// any of the session's
declare const other: FollowedNode<OtherNode>;
const selected = await jrefSelect(both, "> [key=a]", other);
yes<Equal<typeof selected, FollowedNode<JrefNode | JsonNode | OtherNode> | undefined>>();
const fromDefaults = await jrefSelect(defaults, "> [key=a]", other);
yes<Equal<typeof fromDefaults, FollowedNode<JrefNode | JsonNode | OtherNode> | undefined>>();
if (other.jsonType === "object") {
  // A narrowed node's values are any node of its tree
  for (const value of await jrefSelectAll(both, "> *", other)) {
    yes<Equal<typeof value, FollowedNode<JrefNode | JsonNode | OtherNode>>>();
  }
}

// A walk follows a reference it starts at, so a node that could be one
// gives what its tree's values and the session's documents are
declare const unfollowed: OtherNode;
const fromUnfollowed = await jrefSelect(both, ":root", unfollowed);
yes<Equal<typeof fromUnfollowed, FollowedNode<JrefNode | JsonNode | OtherNode> | undefined>>();
