const uriReference = (url) => url.split("#", 1)[0];
const uriFragment = (url) => url.split("#", 2)[1] || "";
const isObject = (value) => typeof value === "object" && !Array.isArray(value) && value !== null;

module.exports = { uriReference, uriFragment, isObject };
