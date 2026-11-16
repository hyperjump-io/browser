/**
 * @import * as API from "./layers.d.ts"
 */

/** @type typeof API.compose */
export const compose = (...decorators) => (inner) => decorators.reduceRight((wrapped, decorate) => decorate(wrapped), inner);

/** @type typeof API.fetcher */
export const fetcher = (fn) => ({
  fetch: async (request, ctx) => fn(request, ctx)
});

/** @type typeof API.layer */
export const layer = (fn) => (inner) => ({
  inner,
  fetch: (request, ctx) => fn(request, ctx, inner)
});

/** @type typeof API.layersOf */
export const layersOf = (stack) => {
  /** @type API.Fetcher[] */
  const layers = [];
  for (let current = /** @type API.Fetcher | undefined */ (stack); current; current = /** @type Partial<API.Layer> */ (current).inner) {
    layers.push(current);
  }

  // An array's iterator and not a generator, which is slower
  return layers.values();
};

/** @type typeof API.findLayer */
export const findLayer = (stack, type) => {
  for (const fetcher of layersOf(stack)) {
    if (fetcher instanceof type) {
      return fetcher;
    }
  }
  return undefined;
};
