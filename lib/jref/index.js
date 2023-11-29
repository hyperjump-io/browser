export const parse = (jref, reviver = undefined) => {
  return JSON.parse(jref, (key, value) => {
    const newValue = value !== null && typeof value.$href === "string" ? new Reference(value.$href) : value;

    return reviver ? reviver(key, newValue) : newValue;
  });
};

export const stringify = JSON.stringify;

export class Reference {
  #href;
  #value;

  constructor(href, value = undefined) {
    this.#href = href;
    this.#value = value ?? { $href: href };
  }

  get href() {
    return this.#href;
  }

  toJSON() {
    return this.#value;
  }
}

export const jrefTypeOf = (value) => {
  const jsType = typeof value;

  switch (jsType) {
    case "number":
    case "string":
    case "boolean":
    case "undefined":
      return jsType;
    case "object":
      if (value instanceof Reference) {
        return "reference";
      } else if (Array.isArray(value)) {
        return "array";
      } else if (value === null) {
        return "null";
      } else if (value.constructor.prototype === Object.prototype) {
        return "object";
      }
    default:
      throw Error(`Not a JRef compatible type: ${value}`);
  }
};
