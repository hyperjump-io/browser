const Hyperjump = require("./core");
const { isObject } = require("./common");
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
            }, {}, options)
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
      const result = doc.then((doc) => Hyperjump.step(propertyName, doc, options));
      return wrapper(result, options);
    }
  }
});

const get = curry((url, doc, options = {}) => {
  const result = Hyperjump.get(url, doc, options);
  return wrapper(result, options);
});

module.exports = { ...Hyperjump, get };
