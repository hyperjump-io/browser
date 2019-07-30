const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require("./natural");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;
  let everyLessThanTwo;
  let everyLessThanFour;

  before(async () => {
    const host = "http://every.hyperjump.io";
    const exampleUrl = "/example1";
    nock(host)
      .get(exampleUrl)
      .reply(200, [
        1,
        3,
        { "$href": "#/0" }
      ], { "Content-Type": "application/reference+json" });

    doc = Hyperjump.get(host + exampleUrl, Hyperjump.nil);
    everyLessThanTwo = Hyperjump.every(async (n) => await n < 2);
    everyLessThanFour = Hyperjump.every(async (n) => await n < 4);
  });

  after(nock.cleanAll);

  When("calling every over a document whose value is an array", () => {
    Then("it should be false for the everyLessThanTwo function", async () => {
      const subject = await everyLessThanTwo(doc);
      expect(subject).to.eql(false);
    });

    Then("it should be true for the everyLessThanFour function", async () => {
      const subject = await everyLessThanFour(doc);
      expect(subject).to.eql(true);
    });
  });

  When("calling every over a normal array", () => {
    let subject;

    before(async () => {
      subject = [1, 3, 1];
    });

    Then("it should be false for the everyLessThanTwo function", async () => {
      const result = await everyLessThanTwo(subject);
      expect(result).to.eql(false);
    });

    Then("it should be true for the everyLessThanFour function", async () => {
      const result = await everyLessThanFour(subject);
      expect(result).to.eql(true);
    });
  });
});
