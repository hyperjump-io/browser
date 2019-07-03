const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require(".");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;
  let someGreaterThanTwo;
  let someGreaterThanFour;

  before(async () => {
    const exampleUrl = "http://json-reference.hyperjump.io/map/example1";
    nock("http://json-reference.hyperjump.io")
      .get("/map/example1")
      .reply(200, [
        1,
        3,
        { "$href": "#/0" }
      ], { "Content-Type": "application/reference+json" });

    doc = Hyperjump.get(`${exampleUrl}`, Hyperjump.nil);
    someGreaterThanTwo = Hyperjump.some((n) => Hyperjump.value(n) > 2);
    someGreaterThanFour = Hyperjump.some((n) => Hyperjump.value(n) > 4);
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

  When("calling some over an array of documents", () => {
    let subject;

    before(async () => {
      subject = [
        await Hyperjump.get("#/0", doc),
        await Hyperjump.get("#/1", doc),
        await Hyperjump.get("#/2", doc)
      ];
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
