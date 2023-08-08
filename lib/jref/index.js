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
