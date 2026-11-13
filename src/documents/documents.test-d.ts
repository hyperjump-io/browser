// What a session's type says about its documents. It's only type-checked.
import { defaultMediaTypes, documentOf, get, Hyperjump, jrefMediaType, jrefObjectEntries, jrefObjectHas, jrefStep, jrefValue } from "../index.js";
import type { DocumentNode, FollowedNode, HyperjumpConfig, JrefMediaTypeDocument, JrefNode, JsonMediaTypeDocument, JsonNode, MediaTypePlugin } from "../index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const yes = <T extends true>(_is?: T) => {};

// A session created without media types has the defaults
const defaults = new Hyperjump({ allowRetrieval: [] });
const node = await get(defaults, "https://example.com/");
yes<Equal<typeof node, FollowedNode<JrefNode | JsonNode>>>();
const fromNone = await documentOf(new Hyperjump(), await get(new Hyperjump(), "https://example.com/", { follow: false }));
yes<Equal<typeof fromNone, JrefMediaTypeDocument | JsonMediaTypeDocument | undefined>>();
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
const fromMaybe = await documentOf(new Hyperjump(maybe), await get(new Hyperjump(maybe), "https://example.com/", { follow: false }));
yes<Equal<typeof fromMaybe, JrefMediaTypeDocument | JsonMediaTypeDocument | undefined>>();

// A reference can lead to a document in any of a session's media types
type OtherNode = JsonNode<{ type: "other" } | { type: "reference"; href: string }>;
declare const otherMediaType: MediaTypePlugin<DocumentNode<OtherNode>>;
const both = new Hyperjump({ mediaTypes: [...defaultMediaTypes, otherMediaType] });
const either = await get(both, "https://example.com/");
yes<Equal<typeof either, FollowedNode<JrefNode | JsonNode | OtherNode>>>();
const document = await documentOf(both, await get(both, "https://example.com/", { follow: false }));
yes<Equal<typeof document, JrefMediaTypeDocument | JsonMediaTypeDocument | DocumentNode<OtherNode> | undefined>>();

// A node that isn't followed can be a reference
const asWritten = await get(both, "https://example.com/", { follow: false });
yes<Equal<typeof asWritten, JrefNode | JsonNode | OtherNode>>();

// A plugin that doesn't say what its documents are
declare const loose: MediaTypePlugin;
const unknownNode = await get(new Hyperjump({ mediaTypes: [jrefMediaType, loose] }), "https://example.com/");
yes<Equal<typeof unknownNode, unknown>>();

// Browsing takes a node of any tree, and gives a node of that tree or of
// any of the session's
declare const other: FollowedNode<OtherNode>;
const stepped = await jrefStep(both, "a", other);
yes<Equal<typeof stepped, FollowedNode<JrefNode | JsonNode | OtherNode>>>();
const fromDefaults = await jrefStep(defaults, "a", other);
yes<Equal<typeof fromDefaults, FollowedNode<JrefNode | JsonNode | OtherNode>>>();
if (other.jsonType === "object") {
  // A narrowed node's values are any node of its tree
  for await (const [, value] of jrefObjectEntries(both, other)) {
    yes<Equal<typeof value, FollowedNode<JrefNode | JsonNode | OtherNode>>>();
  }
}
if (other.jsonType === "string") {
  const text = jrefValue(other);
  yes<Equal<typeof text, string>>();
}

// A node that could be a reference has to be followed first
declare const unfollowed: OtherNode;
// @ts-expect-error
await jrefStep(both, "a", unfollowed);
// @ts-expect-error
jrefObjectHas("a", unfollowed);
// @ts-expect-error
jrefValue(unfollowed);
