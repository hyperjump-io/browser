const { expect } = require("chai");
const { Given, When, Then } = require("../mocha-gherkin.spec");
const Json = require(".");
const nock = require("nock");


Given("a JSON document", () => {
  let doc;
  let aaa;
  let ccc;

  before(async () => {
    const exampleUrl = "http://json.hyperjump.io/entries/example1";
    nock("http://json.hyperjump.io")
      .get("/entries/example1")
      .reply(200, {
        "aaa": 111,
        "bbb": 111,
        "ccc": 333
      }, { "Content-Type": "application/json" });
    doc = await Json.get(exampleUrl, Json.nil);

    nock("http://json.hyperjump.io")
      .get("/entries/example1/aaa")
      .reply(200, 111, { "Content-Type": "application/json" });
    aaa = await Json.get("example1/aaa", doc);

    nock("http://json.hyperjump.io")
      .get("/entries/example1/ccc")
      .reply(200, 222, { "Content-Type": "application/json" });
    ccc = await Json.get("example1/ccc", doc);
  });

  after(nock.cleanAll);

  When("getting the entries for a document whose value is an object", () => {
    let subject;

    before(async () => {
      subject = await Json.entries(doc);
    });

    Then("the values should be documents", async () => {
      expect(subject).to.eql([["aaa", 111], ["bbb", 111], ["ccc", 333]]);
    });
  });

  When("getting entries of an object whose values are documents", () => {
    let subject;

    before(async () => {
      subject = await Json.entries({
        "aaa": aaa,
        "bbb": aaa,
        "ccc": ccc
      });
    });

    Then("the values should be documents", async () => {
      expect(subject).to.eql([["aaa", aaa], ["bbb", aaa], ["ccc", ccc]]);
    });
  });
});
