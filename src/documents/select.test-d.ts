// What jrefSelect's types say about the nodes it selects. It's only
// type-checked.
import { get, Hyperjump, jrefSelect, jrefSelectAll } from "../index.js";
import type { FollowedNode, JrefMediaTypeDocument, JrefNode, JsonMediaTypeDocument, JsonNode, JsonPropertyNameNode, Target } from "../index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const yes = <T extends true>(_is?: T) => {};

const session = new Hyperjump({ allowRetrieval: [] });
const target = await get(session, "https://example.com/");

type Reached = Target<JrefMediaTypeDocument | JsonMediaTypeDocument, FollowedNode<JrefNode | JsonNode>>;

// A selected target is anything a walk can reach
const one = await jrefSelect(session, "> [key=a]", target);
yes<Equal<typeof one, Reached | undefined>>();
const all = await jrefSelectAll(session, "> [key=a]", target);
yes<Equal<typeof all, Reached[]>>();

// A `[jsonType=...]` in the last compound narrows it
const title = await jrefSelect(session, "> [key=title][jsonType=string]", target);
yes<Equal<NonNullable<typeof title>["node"]["jsonType"], "string">>();
yes<Equal<NonNullable<typeof title>["node"]["value"], string>>();
const numbers = await jrefSelectAll(session, "[jsonType=number]", target);
yes<Equal<(typeof numbers)[number]["node"]["jsonType"], "number">>();
yes<Equal<(typeof numbers)[number]["node"]["value"], number>>();

// Wherever it is in the compound, and however it's written
const flag = await jrefSelect(session, ":root > *[jsonType=boolean][key=a]", target);
yes<Equal<NonNullable<typeof flag>["node"]["jsonType"], "boolean">>();
const quoted = await jrefSelect(session, "> [ jsonType = \"null\" ]", target);
yes<Equal<NonNullable<typeof quoted>["node"]["jsonType"], "null">>();
const single = await jrefSelect(session, "> [jsonType='array'] ", target);
yes<Equal<NonNullable<typeof single>["node"]["jsonType"], "array">>();

// A quoted value of another attribute is only its value
const tricky = await jrefSelect(session, "[key=\"a] [b, c\\\"\"][jsonType=object]", target);
yes<Equal<NonNullable<typeof tricky>["node"]["jsonType"], "object">>();

// A list is what any of its selectors selects
const list = await jrefSelectAll(session, "[jsonType=string], > [key=a][jsonType=number]", target);
yes<Equal<(typeof list)[number]["node"]["jsonType"], "string" | "number">>();
const someNarrowed = await jrefSelectAll(session, "[jsonType=string], [key=a], [key=b] > *", target);
yes<Equal<typeof someNarrowed, Reached[]>>();

// Only the last compound says what's selected
const later = await jrefSelect(session, "[jsonType=object] > [key=a]", target);
yes<Equal<typeof later, Reached | undefined>>();
const laterType = await jrefSelect(session, "[jsonType=object] json", target);
yes<Equal<typeof laterType, Reached | undefined>>();

// What no node can be is never
const none = await jrefSelect(session, "[jsonType=string][jsonType=number]", target);
yes<Equal<typeof none, undefined>>();
const unknownType = await jrefSelectAll(session, "[jsonType=text]", target);
yes<Equal<typeof unknownType, never[]>>();

// `[jsonType]` is any value, and so is a selector that isn't a literal
const has = await jrefSelect(session, "[jsonType]", target);
yes<Equal<typeof has, Reached | undefined>>();
declare const selector: string;
const dynamic = await jrefSelect(session, selector, target);
yes<Equal<typeof dynamic, Reached | undefined>>();

// A selection starts at a value
declare const name: Target<unknown, JsonPropertyNameNode>;
// @ts-expect-error A property name node isn't a node a selection starts at
await jrefSelect(session, ":root", name);

// It starts at a target, not at a node
// @ts-expect-error A node isn't a target
await jrefSelect(session, ":root", target.node);
