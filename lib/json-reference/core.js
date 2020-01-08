const JsonPointer = require("@hyperjump/json-pointer");
const Hyperjump = require("../core");
const { uriReference, isObject } = require("../common");


const get = async (browser, options) => {
  if (!("jref" in browser.documents[browser.url])) {
    const jref = parse(browser);
    Hyperjump.extend(browser, { jref });
  }
  const docValue = value(browser);
  return isHref(docValue) ? await Hyperjump.get(docValue["$href"], browser, options) : browser;
};

const parse = (browser) => {
  const doc = browser.documents[browser.url];
  const jref = JSON.parse(Hyperjump.source(browser), (key, value) => {
    if (isEmbedded(value)) {
      const id = uriReference(value["$embedded"]);
      delete value["$embedded"];
      const headers = { "content-type": doc.headers["content-type"] };
      browser.documents[id] = Hyperjump.construct(id, 0, headers, JSON.stringify(value));
      return { "$href": id };
    } else {
      return value;
    }
  });

  return jref;
};

const set = (newValue, browser) => {
  const doc = browser.documents[browser.url];
  const jref = JsonPointer.set(pointer(browser), doc.jref, newValue);
  return Hyperjump.extend(browser, { jref });
};

const value = (browser) => {
  const doc = browser.documents[browser.url];
  return JsonPointer.get(pointer(browser), doc.jref);
};

const stringify = (browser) => JSON.stringify(browser.documents[browser.url].jref);

const step = (key, browser, options = {}) => {
  const ptr = JsonPointer.append(key, pointer(browser));
  const url = "#" + encodeURI(ptr).replace(/#/g, "%23");
  return Hyperjump.get(url, browser, options);
};

const pointer = (browser) => decodeURIComponent(browser.fragment);
const isHref = (value) => isObject(value) && "$href" in value;
const isEmbedded = (value) => isObject(value) && "$embedded" in value;

module.exports = { get, set, value, stringify, step };
