const Hyperjump = require("../core");
const Core = require("./core");


Hyperjump.addContentType("application/json", Core);

module.exports = Hyperjump;
