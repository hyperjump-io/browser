/* global console */
'use strict';
const resolveUrl = require('../index');
// This file is just a helper so I could write the tests faster
// and still have good logging.
module.exports = class TestCase {
 constructor (base, relative, expectedResult) {
   this.base = base;
   this.relative = relative;
   this.expectedResult = expectedResult;
 }

 getActualResult () {
   return resolveUrl(this.base, this.relative);
 }
};
