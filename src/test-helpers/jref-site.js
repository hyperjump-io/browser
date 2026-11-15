import { Hyperjump } from "../hyperjump.js";
import { fetcher } from "../layers.js";
import { defaultMediaTypes } from "../media-types/media-types.js";

/**
 * @import { Json } from "../json/jsonast.d.ts"
 */

/**
 * A session for a pretend site at `https://a.test`, which answers each path
 * with its JRef document, or a `404`, and keeps the paths that were
 * requested
 *
 * @type (pages: Record<string, Json>) => { session: Hyperjump<{ mediaTypes: typeof defaultMediaTypes }>, requests: string[] }
 */
export const jrefSite = (pages) => {
  /** @type string[] */
  const requests = [];
  const stack = fetcher((request) => {
    const path = new URL(request.url).pathname;
    requests.push(path);
    return path in pages
      ? new Response(JSON.stringify(pages[path]), { headers: { "content-type": "application/reference+json" } })
      : new Response(null, { status: 404 });
  });

  return { session: new Hyperjump({ stack, allowRetrieval: ["https://a.test/"], mediaTypes: defaultMediaTypes }), requests };
};
