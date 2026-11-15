// What jrefSelect's types say about the nodes it selects. It's only
// type-checked.
import { get, Hyperjump, jrefSelect, jrefSelectAll } from "../index.js";
import type { FollowedNode, JrefNode, JsonNode, JsonPropertyNameNode } from "../index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const yes = <T extends true>(_is?: T) => {};

const session = new Hyperjump({ allowRetrieval: [] });
const node = await get(session, "https://example.com/");

type Reached = FollowedNode<JrefNode | JsonNode>;

// A selected node is anything a walk can reach
const one = await jrefSelect(session, "> [key=a]", node);
yes<Equal<typeof one, Reached | undefined>>();
const all = await jrefSelectAll(session, "> [key=a]", node);
yes<Equal<typeof all, Reached[]>>();

// A `[jsonType=...]` in the last compound narrows it
const title = await jrefSelect(session, "> [key=title][jsonType=string]", node);
yes<Equal<NonNullable<typeof title>["jsonType"], "string">>();
yes<Equal<NonNullable<typeof title>["value"], string>>();
const numbers = await jrefSelectAll(session, "[jsonType=number]", node);
yes<Equal<(typeof numbers)[number]["jsonType"], "number">>();
yes<Equal<(typeof numbers)[number]["value"], number>>();

// Wherever it is in the compound, and however it's written
const flag = await jrefSelect(session, ":root > *[jsonType=boolean][key=a]", node);
yes<Equal<NonNullable<typeof flag>["jsonType"], "boolean">>();
const quoted = await jrefSelect(session, "> [ jsonType = \"null\" ]", node);
yes<Equal<NonNullable<typeof quoted>["jsonType"], "null">>();
const single = await jrefSelect(session, "> [jsonType='array'] ", node);
yes<Equal<NonNullable<typeof single>["jsonType"], "array">>();

// A quoted value of another attribute is only its value
const tricky = await jrefSelect(session, "[key=\"a] [b, c\\\"\"][jsonType=object]", node);
yes<Equal<NonNullable<typeof tricky>["jsonType"], "object">>();

// A list is what any of its selectors selects
const list = await jrefSelectAll(session, "[jsonType=string], > [key=a][jsonType=number]", node);
yes<Equal<(typeof list)[number]["jsonType"], "string" | "number">>();
const someNarrowed = await jrefSelectAll(session, "[jsonType=string], [key=a], [key=b] > *", node);
yes<Equal<typeof someNarrowed, Reached[]>>();

// Only the last compound says what's selected
const later = await jrefSelect(session, "[jsonType=object] > [key=a]", node);
yes<Equal<typeof later, Reached | undefined>>();
const laterType = await jrefSelect(session, "[jsonType=object] json", node);
yes<Equal<typeof laterType, Reached | undefined>>();

// What no node can be is never
const none = await jrefSelect(session, "[jsonType=string][jsonType=number]", node);
yes<Equal<typeof none, undefined>>();
const unknownType = await jrefSelectAll(session, "[jsonType=text]", node);
yes<Equal<typeof unknownType, never[]>>();

// `[jsonType]` is any value, and so is a selector that isn't a literal
const has = await jrefSelect(session, "[jsonType]", node);
yes<Equal<typeof has, Reached | undefined>>();
declare const selector: string;
const dynamic = await jrefSelect(session, selector, node);
yes<Equal<typeof dynamic, Reached | undefined>>();

// A selection starts at a value
declare const name: JsonPropertyNameNode;
// @ts-expect-error A property name node isn't a node a selection starts at
await jrefSelect(session, ":root", name);
