const Hyperjump = require("../core");
const Core = require("./core");


Hyperjump.addContentType("application/reference+json", Core);

module.exports = Hyperjump;
