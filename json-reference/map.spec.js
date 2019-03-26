const { expect } = require("chai");
const { Given, When, Then } = require("../mocha-gherkin.spec");
const JRef = require(".");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;
  let double;

  before(async () => {
    const exampleUrl = "http://json-reference.hyperjump.io/map/example1";
    nock("http://json-reference.hyperjump.io")
      .get("/map/example1")
      .reply(200, {
        "aaa": [333, { "$href": "#/ccc" }],
        "bbb": { "$href": "#/aaa" },
        "ccc": 111
      }, { "Content-Type": "application/reference+json" });

    doc = await JRef.get(`${exampleUrl}#/aaa`, JRef.nil);
    double = JRef.map(async (item) => JRef.value(item) * 2);
  });

  after(nock.cleanAll);

  When("mapping over a document whose value is an array", () => {
    let subject;

    before(async () => {
      subject = await double(doc);
    });

    Then("it should apply the function to every item in the array", async () => {
      expect(subject).to.eql([666, 222]);
    });
  });

  When("mapping over an array of documents", () => {
    let subject;

    before(async () => {
      subject = await double([
        await JRef.get("#/aaa/0", doc),
        await JRef.get("#/aaa/1", doc)
      ]);
    });

    Then("it should apply the function to every item in the array", async () => {
      expect(subject).to.eql([666, 222]);
    });
  });

  When("mapping over a normal array", () => {
    let subject;

    before(async () => {
      subject = await double([333, 111]);
    });

    Then("it should apply the function to every item in the array", async () => {
      expect(subject).to.eql([666, 222]);
    });
  });
});
