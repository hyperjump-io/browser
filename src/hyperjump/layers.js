/**
 * @typedef {(request: Request) => Promise<Response>} Fetch
 * @typedef {(next: Fetch) => Fetch} Layer
 */

/**
 * Put layers on a `Fetch`. The first layer is the top of the stack, so it
 * sees a request first and its response last.
 *
 * @type (layers: Layer[], fetch: Fetch) => Fetch
 */
export const compose = (layers, fetch) => layers.reduceRight((next, layer) => layer(next), fetch);
