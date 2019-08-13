const Hyperjump = require("./core");
const JRef = require("./json-reference/core");
const Json = require("./json/core");


Hyperjump.addContentType("application/reference+json", JRef);
Hyperjump.addContentType("application/json", Json);

module.exports = Hyperjump;
