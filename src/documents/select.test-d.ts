// What jrefSelect's types say about the nodes it selects. It's only
// type-checked.
import { get, Hyperjump, jrefSelect, jrefSelectAll } from "../index.js";
import type { FollowedNode, JrefNode, JsonNode, JsonPropertyNameNode } from "../index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const yes = <T extends true>(_is?: T) => {};

const session = new Hyperjump({ allowRetrieval: [] });
const node = await get(session, "https://example.com/");

// A selected node is anything a walk can reach, and the selector doesn't
// narrow it
const one = await jrefSelect(session, "> [key=a]", node);
yes<Equal<typeof one, FollowedNode<JrefNode | JsonNode> | undefined>>();
const all = await jrefSelectAll(session, "[jsonType=number]", node);
yes<Equal<typeof all, FollowedNode<JrefNode | JsonNode>[]>>();

// A selection starts at a value
declare const name: JsonPropertyNameNode;
// @ts-expect-error A property name node isn't a node a selection starts at
await jrefSelect(session, ":root", name);
