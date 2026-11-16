// What jrefVisit's types say about the nodes it visits. It's only type-checked.
import { get, Hyperjump, jrefFind, jrefFindAll, jrefVisit } from "../index.js";
import type { FollowedNode, JrefMediaTypeDocument, JrefNode, JsonMediaTypeDocument, JsonNode, JsonPropertyNameNode, Target } from "../index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const yes = <T extends true>(_is?: T) => {};

const session = new Hyperjump({ allowRetrieval: [] });
const target = await get(session, "https://example.com/");

type Reached = Target<JrefMediaTypeDocument | JsonMediaTypeDocument, FollowedNode<JrefNode | JsonNode>>;

// Without a test, the visitor gets anything a walk can reach: a target with a
// node of any of the session's media types
await jrefVisit(session, target, (visited, key, parent, depth) => {
  yes<Equal<typeof visited, Reached>>();
  yes<Equal<typeof key, string | undefined>>();
  yes<Equal<typeof parent, Reached | undefined>>();
  yes<Equal<typeof depth, number>>();
});

// An object test narrows to the nodes that can have its properties
await jrefVisit(session, target, { jsonType: "number" }, (visited) => {
  yes<Equal<typeof visited.node.jsonType, "number">>();
});

// An array test narrows to the nodes any of its tests can pass
await jrefVisit(session, target, [{ jsonType: "string" }, { jsonType: "boolean" }], (visited) => {
  yes<Equal<typeof visited.node.jsonType, "string" | "boolean">>();
  yes<Equal<typeof visited.node.value, string | boolean>>();
});

// A type predicate narrows, and a function that isn't one doesn't
await jrefVisit(session, target, (visited): visited is Target<JsonMediaTypeDocument, FollowedNode<JsonNode> & { jsonType: "string" }> => visited.node.jsonType === "string", (visited) => {
  yes<Equal<typeof visited.node.jsonType, "string">>();
});
await jrefVisit(session, target, (_visited, key) => key === "a", (visited) => {
  yes<Equal<typeof visited, Reached>>();
});

// A property no node has narrows to nothing
await jrefVisit(session, target, { jsonType: "date" }, (visited) => {
  yes<Equal<typeof visited, never>>();
});

// A property name isn't a value, so it isn't visited
declare const name: Target<unknown, JsonPropertyNameNode>;
// @ts-expect-error A property name node isn't a node a walk starts at
await jrefVisit(session, name, () => {});

// Options go after the visitor, with or without a test
await jrefVisit(session, target, () => {}, { maxDepth: 10 });
await jrefVisit(session, target, "json", () => {}, { maxDepth: Infinity });
// @ts-expect-error A walk's options don't have a `depth`
await jrefVisit(session, target, () => {}, { depth: 10 });

// jrefFind and jrefFindAll narrow by their test like a visitor's node
const found = await jrefFind(session, target, { jsonType: "number" });
yes<Equal<NonNullable<typeof found>["node"]["jsonType"], "number">>();
yes<Equal<undefined extends typeof found ? true : false, true>>();
const foundAll = await jrefFindAll(session, target, [{ jsonType: "string" }, { jsonType: "boolean" }]);
for (const each of foundAll) {
  yes<Equal<typeof each.node.value, string | boolean>>();
}

// A null test passes every node, so it doesn't narrow
await jrefVisit(session, target, null, (visited) => {
  yes<Equal<typeof visited, Reached>>();
});
