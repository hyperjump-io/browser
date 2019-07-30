const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require("./natural");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;
  let someGreaterThanTwo;
  let someGreaterThanFour;

  before(async () => {
    const host = "http://some.hyperjump.io";
    const exampleUrl = "/example1";
    nock(host)
      .get(exampleUrl)
      .reply(200, [
        1,
        3,
        { "$href": "#/0" }
      ], { "Content-Type": "application/reference+json" });

    doc = Hyperjump.get(host + exampleUrl, Hyperjump.nil);
    someGreaterThanTwo = Hyperjump.some(async (n) => await n > 2);
    someGreaterThanFour = Hyperjump.some(async (n) => await n > 4);
  });

  after(nock.cleanAll);

  When("calling some over a document whose value is an array", () => {
    Then("it should be true for the someGreaterThanTwo function", async () => {
      const subject = await someGreaterThanTwo(doc);
      expect(subject).to.eql(true);
    });

    Then("it should be false for the someGreaterThanFour function", async () => {
      const subject = await someGreaterThanFour(doc);
      expect(subject).to.eql(false);
    });
  });

  When("calling some over a normal array", () => {
    let subject;

    before(async () => {
      subject = [1, 3, 1];
    });

    Then("it should be true for the someGreaterThanTwo function", async () => {
      const result = await someGreaterThanTwo(subject);
      expect(result).to.eql(true);
    });

    Then("it should be false for the someGreaterThanFour function", async () => {
      const result = await someGreaterThanFour(subject);
      expect(result).to.eql(false);
    });
  });
});
