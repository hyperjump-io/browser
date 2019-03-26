const { expect } = require("chai");
const { Given, When, Then } = require("../mocha-gherkin.spec");
const JRef = require(".");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;
  let sumOf;

  before(async () => {
    const exampleUrl = "http://json-reference.hyperjump.io/reduce/example1";
    nock("http://json-reference.hyperjump.io")
      .get("/reduce/example1")
      .reply(200, {
        "aaa": [333, { "$href": "#/bbb" }, { "$href": "#/ccc" }],
        "bbb": 222,
        "ccc": 111
      }, { "Content-Type": "application/reference+json" });

    doc = await JRef.get(`${exampleUrl}#/aaa`, JRef.nil);
    sumOf = JRef.reduce(async (sum, item) => sum + JRef.value(item), 0);
  });

  after(nock.cleanAll);

  When("reducing a document whose value is an array", () => {
    let subject;

    before(async () => {
      subject = await sumOf(doc);
    });

    Then("it should result in the sum of the numbers in the array", async () => {
      expect(subject).to.eql(666);
    });
  });

  When("reducing an array of documents", () => {
    let subject;

    before(async () => {
      subject = await sumOf([
        await JRef.get("#/aaa/0", doc),
        await JRef.get("#/aaa/1", doc),
        await JRef.get("#/aaa/2", doc)
      ]);
    });

    Then("it should result in the sum of the numbers in the array", async () => {
      expect(subject).to.eql(666);
    });
  });

  When("reducing a normal array", () => {
    let subject;

    before(async () => {
      subject = await sumOf([333, 222, 111]);
    });

    Then("it should apply the function to every item in the array", async () => {
      expect(subject).to.eql(666);
    });
  });
});
