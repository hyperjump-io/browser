// What jrefVisit's types say about the nodes it visits. It's only type-checked.
import { get, Hyperjump, jrefFind, jrefFindAll, jrefVisit } from "../index.js";
import type { FollowedNode, JrefNode, JsonNode, JsonPropertyNameNode } from "../index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const yes = <T extends true>(_is?: T) => {};

const session = new Hyperjump({ allowRetrieval: [] });
const node = await get(session, "https://example.com/");

// Without a test, the visitor gets anything a walk can reach: a node of any of
// the session's media types
await jrefVisit(session, node, (visited, key, parent, depth) => {
  yes<Equal<typeof visited, FollowedNode<JrefNode | JsonNode>>>();
  yes<Equal<typeof key, string | undefined>>();
  yes<Equal<typeof parent, FollowedNode<JrefNode | JsonNode> | undefined>>();
  yes<Equal<typeof depth, number>>();
});

// An object test narrows to the nodes that can have its properties
await jrefVisit(session, node, { jsonType: "number" }, (visited) => {
  yes<Equal<typeof visited.jsonType, "number">>();
});

// An array test narrows to the nodes any of its tests can pass
await jrefVisit(session, node, [{ jsonType: "string" }, { jsonType: "boolean" }], (visited) => {
  yes<Equal<typeof visited.jsonType, "string" | "boolean">>();
  yes<Equal<typeof visited.value, string | boolean>>();
});

// A type predicate narrows, and a function that isn't one doesn't
await jrefVisit(session, node, (visited): visited is FollowedNode<JsonNode> & { jsonType: "string" } => visited.jsonType === "string", (visited) => {
  yes<Equal<typeof visited.jsonType, "string">>();
});
await jrefVisit(session, node, (_visited, key) => key === "a", (visited) => {
  yes<Equal<typeof visited, FollowedNode<JrefNode | JsonNode>>>();
});

// A property no node has narrows to nothing
await jrefVisit(session, node, { jsonType: "date" }, (visited) => {
  yes<Equal<typeof visited, never>>();
});

// A property name isn't a value, so it isn't visited
declare const name: JsonPropertyNameNode;
// @ts-expect-error A property name node isn't a node a walk starts at
await jrefVisit(session, name, () => {});

// Options go after the visitor, with or without a test
await jrefVisit(session, node, () => {}, { maxDepth: 10 });
await jrefVisit(session, node, "json", () => {}, { maxDepth: Infinity });
// @ts-expect-error A walk's options don't have a `depth`
await jrefVisit(session, node, () => {}, { depth: 10 });

// jrefFind and jrefFindAll narrow by their test like a visitor's node
const found = await jrefFind(session, node, { jsonType: "number" });
yes<Equal<NonNullable<typeof found>["jsonType"], "number">>();
yes<Equal<undefined extends typeof found ? true : false, true>>();
const foundAll = await jrefFindAll(session, node, [{ jsonType: "string" }, { jsonType: "boolean" }]);
for (const each of foundAll) {
  yes<Equal<typeof each.value, string | boolean>>();
}

// A null test passes every node, so it doesn't narrow
await jrefVisit(session, node, null, (visited) => {
  yes<Equal<typeof visited, FollowedNode<JrefNode | JsonNode>>>();
});
