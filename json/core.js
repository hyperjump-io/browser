const Hyperjump = require("../core");


const get = async (doc) => {
  const json = JSON.parse(Hyperjump.source(doc));
  return !("json" in doc) ? Hyperjump.extend(doc, { json }) : doc;
};
const value = (doc) => doc.json;
const step = async (key, doc) => value(doc)[key];

module.exports = { get, value, step };
