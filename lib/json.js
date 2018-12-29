import * as Core from "~/core";


Core.addContentType("application/json", async (doc = Core.nil) => doc);

export const get = async (url, doc = Core.nil, options = {}) => {
  const defaultHeaders = { "Accept": "application/json" };
  options.headers = { ...defaultHeaders, ...options.headers };
  return Core.get(url, doc, options);
};

export const nil = Core.nil;
export const source = Core.source;
export const json = (doc = Core.nil) => JSON.parse(doc.body);
