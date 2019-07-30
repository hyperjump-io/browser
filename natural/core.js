const curry = require("just-curry-it");
const Hyperjump = require("..");
const { isObject } = require("../common");


const wrapper = (doc, options = {}) => {
  return new Proxy(doc, {
    get: (doc, propertyName) => {
      if (propertyName === "then") {
        const v = value(doc, options);
        const then = v.then;
        return then.bind(v);
      } else {
        const value = safeStep(propertyName, doc, options);
        return wrapper(value);
      }
    }
  });
};

const value = async (doc, options = {}) => {
  const docValue = Hyperjump.value(await doc);

  if (isObject(docValue)) {
    return Object.keys(docValue).reduce((acc, key) => {
      const resultDoc = Hyperjump.step(key, doc, options);
      acc[key] = wrapper(resultDoc, options);
      return acc;
    }, {});
  } else if (Array.isArray(docValue)) {
    return Object.keys(docValue).map((key) => {
      const resultDoc = Hyperjump.step(key, doc, options);
      return wrapper(resultDoc, options);
    });
  } else {
    return docValue;
  }
};

const safeStep = async (propertyName, doc, options = {}) => {
  const docValue = Hyperjump.value(await doc);
  const keys = Object.keys(docValue);
  return keys.includes(propertyName) ? Hyperjump.step(propertyName, doc, options) : undefined;
};

const get = curry((url, contextDoc, options = {}) => {
  const resultDoc = Hyperjump.get(url, contextDoc, options);
  return wrapper(resultDoc, options);
});

module.exports = Object.assign({}, Hyperjump, { get });
