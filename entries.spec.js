const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require(".");


Given("a JSON Reference document", () => {
  When("getting entries of a normal object", () => {
    let subject;

    before(async () => {
      subject = await Hyperjump.entries({
        "aaa": 111,
        "bbb": 111,
        "ccc": 333
      });
    });

    Then("the values should normal values", async () => {
      expect(subject).to.eql([["aaa", 111], ["bbb", 111], ["ccc", 333]]);
    });
  });
});
