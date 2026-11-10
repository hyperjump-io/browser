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
export const layersOf = function* (stack) {
  /** @type API.Fetcher | undefined */
  let current = stack;
  while (current) {
    yield current;
    current = /** @type Partial<API.Layer> */ (current).inner;
  }
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
