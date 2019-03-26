const { expect } = require("chai");
const { Given, When, Then } = require("../mocha-gherkin.spec");
const JRef = require(".");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;
  let aaa;
  let ccc;

  before(async () => {
    const exampleUrl = "http://json-reference.hyperjump.io/entries/example1";
    nock("http://json-reference.hyperjump.io")
      .get("/entries/example1")
      .reply(200, {
        "aaa": 111,
        "bbb": { "$href": "#/aaa" },
        "ccc": 333
      }, { "Content-Type": "application/reference+json" });

    doc = await JRef.get(exampleUrl, JRef.nil);
    aaa = await JRef.get("#/aaa", doc);
    ccc = await JRef.get("#/ccc", doc);
  });

  after(nock.cleanAll);

  When("getting the entries for a document whose value is an object", () => {
    let subject;

    before(async () => {
      subject = await JRef.entries(doc);
    });

    Then("the values should be documents", async () => {
      expect(subject).to.eql([["aaa", aaa], ["bbb", aaa], ["ccc", ccc]]);
    });
  });

  When("getting entries of an object whose values are documents", () => {
    let subject;

    before(async () => {
      subject = await JRef.entries({
        "aaa": aaa,
        "bbb": aaa,
        "ccc": ccc
      });
    });

    Then("the values should be documents", async () => {
      expect(subject).to.eql([["aaa", aaa], ["bbb", aaa], ["ccc", ccc]]);
    });
  });

  When("getting entries of a normal object", () => {
    let subject;

    before(async () => {
      subject = await JRef.entries({
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
