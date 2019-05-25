const Hyperjump = require("../core");
const { isObject } = require("../common");
const curry = require("just-curry-it");


const wrapper = (doc, options = {}) => new Proxy(Promise.resolve(doc), {
  get: (doc, propertyName) => {
    if (propertyName === "then") {
      const value = doc.then((doc) => {
        const docValue = Hyperjump.value(doc);
        if (Array.isArray(docValue)) {
          return Hyperjump.map((a) => wrapper(a), doc, options);
        } else if (isObject(docValue)) {
          return Hyperjump.pipeline([
            Hyperjump.entries,
            Hyperjump.reduce((acc, [key, value]) => {
              acc[key] = wrapper(value, options);
              return acc;
            }, {})
          ], doc);
        } else {
          return Hyperjump.value(doc);
        }
      });
      const then = value.then;
      return then.bind(value);
    } else if (typeof propertyName === "symbol" || propertyName === "inspect") {
      return doc[propertyName];
    } else {
      const result = Hyperjump.step(propertyName, doc, options);
      return wrapper(result, options);
    }
  }
});

const get = curry((url, contextDoc, options = {}) => {
  const doc = Hyperjump.get(url, contextDoc, options);
  return wrapper(doc, options);
});

module.exports = Object.assign({}, Hyperjump, { get });
