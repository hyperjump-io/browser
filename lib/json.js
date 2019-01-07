const Hyperjump = require("./hyperjump");


const contentType = "application/json";
const contentTypeHandler = async (doc) => doc;
Hyperjump.addContentType(contentType, contentTypeHandler);

const nil = Hyperjump.nil;
const source = Hyperjump.source;

const get = async (url, doc = nil, options = {}) => {
  const defaultHeaders = { "Accept": "application/json" };
  options.headers = { ...defaultHeaders, ...options.headers };
  return Hyperjump.get(url, doc, options);
};

const value = (doc = nil) => JSON.parse(doc.body);

module.exports = { contentType, contentTypeHandler, get, nil, source, value };
