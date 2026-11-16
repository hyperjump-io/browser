// What the step functions' types say about what they return. It's only
// type-checked.
import { get, Hyperjump, jrefArrayIter, jrefFind, jrefObjectEntries, jrefObjectHas, jrefObjectKeys, jrefObjectValues, jrefSelect, jrefStep, jrefValue, jrefVisit } from "../index.js";
import type { FollowedNode, JrefDocumentNode, JrefMediaTypeDocument, JrefNode, JsonMediaTypeDocument, JsonNode, Target } from "../index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const yes = <T extends true>(_is?: T) => {};

const session = new Hyperjump({ allowRetrieval: [] });
const target = await get(session, "https://example.com/");

type Documents = JrefMediaTypeDocument | JsonMediaTypeDocument;
type Reached = FollowedNode<JrefNode | JsonNode>;

// A member is followed, so it's a node of any of the session's media types
// that isn't a reference, in a document of any of them
const member = await jrefStep(session, "a", target);
yes<Equal<typeof member.node, Reached>>();
yes<Equal<typeof member.document, Documents>>();
const followed = await jrefStep(session, "a", target, { reference: "follow" });
yes<Equal<typeof followed.node, Reached>>();

// With `reference: "manual"`, or an option that could be, it can be a
// reference
const written = await jrefStep(session, "a", target, { reference: "manual" });
yes<Equal<Extract<typeof written.node, { type: "reference" }> extends never ? false : true, true>>();
declare const followOrNot: "follow" | "manual";
const maybeWritten = await jrefStep(session, "a", target, { reference: followOrNot });
yes<Equal<Extract<typeof maybeWritten.node, { type: "reference" }> extends never ? false : true, true>>();

// The iterators give targets, and entries give them with their keys
for await (const item of jrefArrayIter(session, target)) {
  yes<Equal<typeof item.node, Reached>>();
}
for await (const value of jrefObjectValues(session, target)) {
  yes<Equal<typeof value.node, Reached>>();
}
for await (const [key, value] of jrefObjectEntries(session, target)) {
  yes<Equal<typeof key, string>>();
  yes<Equal<typeof value.node, Reached>>();
}
for await (const item of jrefArrayIter(session, target, { reference: "manual" })) {
  yes<Equal<Extract<typeof item.node, { type: "reference" }> extends never ? false : true, true>>();
}

// Property names need no session
yes<Equal<ReturnType<typeof jrefObjectHas>, boolean>>();
for (const key of jrefObjectKeys(target)) {
  yes<Equal<typeof key, string>>();
}

// A value is a scalar, and it's its node's kind of value if that's known
yes<Equal<ReturnType<typeof jrefValue<Reached & { jsonType: "number" }>>, number>>();
const scalar = jrefValue(target);
yes<Equal<typeof scalar, string | number | boolean | null>>();
declare const text: Target<unknown, JsonNode & { jsonType: "string" }>;
const string = jrefValue(text);
yes<Equal<typeof string, string>>();

// A walk that doesn't follow references reaches references
await jrefVisit(session, target, (visited) => {
  yes<Equal<Extract<typeof visited.node, { type: "reference" }> extends never ? false : true, true>>();
}, { reference: "manual" });
await jrefVisit(session, target, (visited) => {
  yes<Equal<typeof visited.node, Reached>>();
}, { maxDepth: 10 });
const reference = await jrefFind(session, target, "reference", { reference: "manual" });
yes<Equal<NonNullable<typeof reference>["node"]["type"], "reference">>();
const never = await jrefFind(session, target, "reference");
yes<Equal<typeof never, undefined>>();
const selected = await jrefSelect(session, "> [key=a]", target, { reference: "manual" });
yes<Equal<Extract<NonNullable<typeof selected>["node"], { type: "reference" }> extends never ? false : true, true>>();

// A document is browsed from its root, as a target of it would be
declare const document: JrefMediaTypeDocument;
const fromDocument = await jrefStep(session, "a", document);
yes<Equal<typeof fromDocument.node, Reached>>();
yes<Equal<typeof fromDocument.document, Documents>>();
const writtenInDocument = await jrefStep(session, "a", document, { reference: "manual" });
yes<Equal<typeof writtenInDocument, Target<JrefMediaTypeDocument, JrefNode>>>();
const selectedInDocument = await jrefSelect(session, "> [key=a][jsonType=string]", document);
yes<Equal<NonNullable<typeof selectedInDocument>["node"]["value"], string>>();
jrefObjectHas("a", document);
await jrefVisit(session, document, () => {});

// A reference is followed from a tree, whatever its parse status
declare const tree: JrefDocumentNode;
await get(session, "https://example.com/", { referencedFrom: tree });
