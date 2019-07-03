const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require(".");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;
  let everyLessThanTwo;
  let everyLessThanFour;

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
    everyLessThanTwo = Hyperjump.every((n) => Hyperjump.value(n) < 2);
    everyLessThanFour = Hyperjump.every((n) => Hyperjump.value(n) < 4);
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

  When("calling every over an array of documents", () => {
    let subject;

    before(async () => {
      subject = [
        await Hyperjump.get("#/0", doc),
        await Hyperjump.get("#/1", doc),
        await Hyperjump.get("#/2", doc)
      ];
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
