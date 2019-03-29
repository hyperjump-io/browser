const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require(".");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;
  let aaa0;
  let bbb;
  let positiveNumbersOf;

  before(async () => {
    const exampleUrl = "http://json-reference.hyperjump.io/filter/example1";
    nock("http://json-reference.hyperjump.io")
      .get("/filter/example1")
      .reply(200, {
        "aaa": [333, -222, { "$href": "#/bbb" }, { "$href": "#/ccc" }],
        "bbb": 222,
        "ccc": -111
      }, { "Content-Type": "application/reference+json" });

    doc = await Hyperjump.get(`${exampleUrl}#/aaa`, Hyperjump.nil);
    aaa0 = await Hyperjump.get(`#/aaa/0`, doc);
    bbb = await Hyperjump.get(`#/bbb`, doc);
    positiveNumbersOf = Hyperjump.filter(async (item) => Hyperjump.value(item) > 0);
  });

  after(nock.cleanAll);

  When("filtering a document whose value is an array", () => {
    let subject;

    before(async () => {
      subject = await positiveNumbersOf(doc);
    });

    Then("it should return only the positive numbers", async () => {
      expect(subject).to.eql([aaa0, bbb]);
    });
  });

  When("filtering over an array of documents", () => {
    let subject;

    before(async () => {
      subject = await positiveNumbersOf([
        await Hyperjump.get("#/aaa/0", doc),
        await Hyperjump.get("#/aaa/1", doc),
        await Hyperjump.get("#/aaa/2", doc),
        await Hyperjump.get("#/aaa/3", doc)
      ]);
    });

    Then("it should return only the positive numbers", async () => {
      expect(subject).to.eql([aaa0, bbb]);
    });
  });

  When("filtering a normal array", () => {
    let subject;

    before(async () => {
      subject = await positiveNumbersOf([333, -222, 222, -111]);
    });

    Then("it should return only the positive numbers", async () => {
      expect(subject).to.eql([333, 222]);
    });
  });
});
