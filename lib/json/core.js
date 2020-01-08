const Hyperjump = require("../core");


const get = (browser) => {
  const doc = browser.documents[browser.url];

  if (!("json" in doc)) {
    const json = JSON.parse(Hyperjump.source(browser));
    Hyperjump.extend(browser, { json });
  }

  return browser;
};

const set = (newValue, browser) => {
  browser.documents[browser.url].json = newValue;
  return browser;
};

const value = (browser) => browser.documents[browser.url].json;
const stringify = (browser) => JSON.stringify(browser.documents[browser.url].json);
const step = (key, browser) => value(browser)[key];

module.exports = { get, set, value, stringify, step };
