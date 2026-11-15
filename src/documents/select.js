import { follow, memberEntries } from "./walk.js";

/**
 * @import * as API from "./select.d.ts"
 * @import { DocumentSession } from "./documents.d.ts"
 * @import { Walked } from "./walk.js"
 */

/**
 * @typedef {{
 *   type?: string;
 *   root: boolean;
 *   attributes: Attribute[];
 * }} Compound
 *
 * @typedef {{ name: string; value?: string }} Attribute
 *
 * @typedef {{
 *   id: number;
 *   compounds: Compound[];
 *   combinators: Combinator[];
 * }} Complex
 *
 * @typedef {" " | ">"} Combinator
 *
 * A place in a selector: `compounds[index]` is the next to match. A
 * `descendant` state can match any node below where it started, and a state
 * that isn't can only match a child.
 *
 * @typedef {{ complex: Complex; index: number; descendant: boolean }} State
 */

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefSelect = /** @type typeof API.jrefSelect */ (async (
  /** @type DocumentSession */ session,
  /** @type string */ selector,
  /** @type Walked */ node
) => {
  /** @type Walked | undefined */
  let found;
  await select(session, parseSelector(selector), node, (matchedNode) => {
    found = matchedNode;
    return true;
  });

  return found;
});

// eslint-disable-next-line @stylistic/no-extra-parens
export const jrefSelectAll = /** @type typeof API.jrefSelectAll */ (async (
  /** @type DocumentSession */ session,
  /** @type string */ selector,
  /** @type Walked */ node
) => {
  /** @type Set<Walked> */
  const found = new Set();
  await select(session, parseSelector(selector), node, (matchedNode) => {
    found.add(matchedNode);
    return false;
  });

  return [...found];
});

/**
 * Walk the tree with its references followed, matching it against every
 * selector at once. A member is only followed if some selector could match
 * it or what's under it, which for a child combinator is known from its key.
 *
 * @type (session: DocumentSession, selectors: Complex[], node: Walked, onMatch: (node: Walked) => boolean) => Promise<void>
 */
const select = async (session, selectors, node, onMatch) => {
  const states = selectors.map((complex) => ({ complex, index: 0, descendant: true }));
  await selectNode(session, node, undefined, 0, states, new Map(), onMatch);
};

/**
 * `ancestors` is the nodes being walked, each with the states it's being
 * walked with. A node is walked again only with states it isn't being
 * walked with, so a reference back to it walks what it could match that its
 * ancestor couldn't, and a cycle ends because there are only so many
 * states. They're the nodes and not their locations, because two documents
 * can say they have the same URL.
 *
 * @type (session: DocumentSession, node: Walked, key: string | undefined, depth: number, states: State[], ancestors: Map<Walked, Set<string>>, onMatch: (node: Walked) => boolean) => Promise<boolean>
 */
const selectNode = async (session, node, key, depth, states, ancestors, onMatch) => {
  /** @type Map<string, State> */
  const next = new Map();
  let isMatch = false;
  for (const state of states) {
    const { compounds, combinators } = state.complex;
    // `:root` can't match below the root
    if (state.descendant && !compounds[state.index].root) {
      addState(next, state);
    }

    if (matchesCompound(compounds[state.index], node, key, depth === 0)) {
      if (state.index === compounds.length - 1) {
        isMatch = true;
      } else {
        addState(next, {
          complex: state.complex,
          index: state.index + 1,
          descendant: combinators[state.index] === " "
        });
      }
    }
  }

  // `true` stops the walk
  if (isMatch && onMatch(node)) {
    return true;
  }

  if (next.size === 0) {
    return false;
  }

  // A reference back to a node that's being walked with the same states is
  // matched, but what's under it is already being walked
  const signature = [...next.keys()].sort().join(",");
  const walking = ancestors.get(node) ?? new Set();
  if (walking.has(signature)) {
    return false;
  }

  const nextStates = [...next.values()];
  walking.add(signature);
  ancestors.set(node, walking);
  try {
    for (const [memberKey, memberNode] of memberEntries(node)) {
      // A state that has to match a child can rule it out by its key, before
      // it's followed
      const memberStates = nextStates.filter((state) => state.descendant || keyCanMatch(state.complex.compounds[state.index], memberKey));
      if (memberStates.length === 0) {
        continue;
      }

      const followedNode = /** @type Walked */ (await follow(session, memberNode));
      if (await selectNode(session, followedNode, memberKey, depth + 1, memberStates, ancestors, onMatch)) {
        return true;
      }
    }
  } finally {
    walking.delete(signature);
    if (walking.size === 0) {
      ancestors.delete(node);
    }
  }

  return false;
};

/** @type (states: Map<string, State>, state: State) => void */
const addState = (states, state) => {
  // A selector reaches the same state more than one way, like `a b` at a
  // node under two `a`s, so they're kept once
  states.set(`${state.complex.id} ${state.index} ${state.descendant}`, state);
};

/** @type (compound: Compound, node: Walked, key: string | undefined, isRoot: boolean) => boolean */
const matchesCompound = (compound, node, key, isRoot) => {
  if (compound.root && !isRoot) {
    return false;
  }

  if (compound.type !== undefined && node.type !== compound.type) {
    return false;
  }

  return compound.attributes.every((attribute) => {
    const value = attribute.name === "key" ? key : /** @type Record<string, unknown> */ (node)[attribute.name];
    return attributeMatches(attribute, value);
  });
};

/** @type (compound: Compound, key: string) => boolean */
const keyCanMatch = (compound, key) => !compound.root && compound.attributes
  .every((attribute) => attribute.name !== "key" || attributeMatches(attribute, key));

/** @type (attribute: Attribute, value: unknown) => boolean */
const attributeMatches = (attribute, value) => {
  // `[name]` is whether the node has the property, whatever its value
  if (attribute.value === undefined) {
    return value !== undefined;
  }

  // A value is compared as a string, which an object or an array isn't
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean" && value !== null) {
    return false;
  }

  return String(value) === attribute.value;
};

// Parsing

/**
 * @typedef {{ selector: string; position: number }} Parser
 */

/**
 * A selector list. It's parsed for each call. Parsing takes microseconds,
 * and a walk that follows references takes far longer.
 *
 * @type (selector: string) => Complex[]
 */
const parseSelector = (selector) => {
  const parser = { selector, position: 0 };
  /** @type Complex[] */
  const list = [];
  do {
    skipWhitespace(parser);
    list.push(parseComplex(parser, list.length));
    skipWhitespace(parser);
  } while (eat(parser, ","));

  if (parser.position < selector.length) {
    fail(parser, "Expected ',' or the end of the selector");
  }

  return list;
};

/** @type (parser: Parser, id: number) => Complex */
const parseComplex = (parser, id) => {
  /** @type Compound[] */
  const compounds = [];
  /** @type Combinator[] */
  const combinators = [];

  // A selector that starts with `>` is relative to the node the selection
  // starts at, like `:root >`
  if (peek(parser) === ">") {
    compounds.push({ root: true, attributes: [] });
  } else {
    compounds.push(parseCompound(parser));
  }

  while (true) {
    const hadWhitespace = skipWhitespace(parser);
    if (peek(parser) === "+" || peek(parser) === "~") {
      fail(parser, `'${peek(parser)}' isn't supported. The combinators are ' ' and '>'`);
    }
    if (eat(parser, ">")) {
      skipWhitespace(parser);
      combinators.push(">");
    } else if (hadWhitespace && parser.position < parser.selector.length && peek(parser) !== ",") {
      combinators.push(" ");
    } else {
      break;
    }
    compounds.push(parseCompound(parser));
  }

  return { id, compounds, combinators };
};

/** @type (parser: Parser) => Compound */
const parseCompound = (parser) => {
  /** @type Compound */
  const compound = { root: false, attributes: [] };
  const start = parser.position;

  if (eat(parser, "*")) {
    // Any type
  } else if (identifierCharacter.test(peek(parser))) {
    compound.type = parseIdentifier(parser);
  }

  while (true) {
    if (eat(parser, "[")) {
      compound.attributes.push(parseAttribute(parser));
    } else if (eat(parser, ":")) {
      const pseudo = parseIdentifier(parser);
      if (pseudo !== "root" && pseudo !== "scope") {
        fail(parser, `':${pseudo}' isn't supported. The pseudo-classes are ':root' and ':scope'`);
      }
      compound.root = true;
    } else {
      break;
    }
  }

  if (parser.position === start) {
    fail(parser, "Expected a type, '*', an attribute, or ':root'");
  }

  return compound;
};

/** @type (parser: Parser) => Attribute */
const parseAttribute = (parser) => {
  skipWhitespace(parser);
  const name = parseIdentifier(parser);
  skipWhitespace(parser);
  if (eat(parser, "]")) {
    return { name };
  }

  if (!eat(parser, "=")) {
    fail(parser, "Expected '=' or ']'");
  }
  skipWhitespace(parser);
  const quote = peek(parser);
  const value = quote === "\"" || quote === "'" ? parseString(parser, quote) : parseIdentifier(parser);
  skipWhitespace(parser);
  if (!eat(parser, "]")) {
    fail(parser, "Expected ']'");
  }

  return { name, value };
};

/** @type (parser: Parser, quote: string) => string */
const parseString = (parser, quote) => {
  parser.position++;
  let value = "";
  while (parser.position < parser.selector.length) {
    const character = parser.selector[parser.position++];
    if (character === quote) {
      return value;
    } else if (character === "\\" && parser.position < parser.selector.length) {
      value += parser.selector[parser.position++];
    } else {
      value += character;
    }
  }

  return fail(parser, "Unclosed string");
};

const identifierCharacter = /[\w$-]/;

/** @type (parser: Parser) => string */
const parseIdentifier = (parser) => {
  const start = parser.position;
  while (identifierCharacter.test(peek(parser))) {
    parser.position++;
  }
  if (parser.position === start) {
    fail(parser, "Expected a name");
  }

  return parser.selector.slice(start, parser.position);
};

/** @type (parser: Parser) => boolean */
const skipWhitespace = (parser) => {
  const start = parser.position;
  while (/\s/.test(peek(parser))) {
    parser.position++;
  }

  return parser.position > start;
};

/** @type (parser: Parser, character: string) => boolean */
const eat = (parser, character) => {
  if (peek(parser) === character) {
    parser.position++;
    return true;
  }

  return false;
};

/** @type (parser: Parser) => string */
const peek = (parser) => parser.selector[parser.position] ?? "";

/** @type (parser: Parser, message: string) => never */
const fail = (parser, message) => {
  throw SyntaxError(`Invalid selector '${parser.selector}' at ${parser.position}: ${message}`);
};
