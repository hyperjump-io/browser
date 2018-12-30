const Core = require("./core");


Core.addContentType("application/json", async (doc = Core.nil) => doc);

const get = async (url, doc = Core.nil, options = {}) => {
  const defaultHeaders = { "Accept": "application/json" };
  options.headers = { ...defaultHeaders, ...options.headers };
  return Core.get(url, doc, options);
};

const nil = Core.nil;
const source = Core.source;
const json = (doc = Core.nil) => JSON.parse(doc.body);

module.exports = { get, nil, source, json };
