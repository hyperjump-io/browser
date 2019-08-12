const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require(".");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;

  before(async () => {
    const host = "http://allValues.hyperjump.io";
    const exampleUrl = "/example1";
    nock(host)
      .get(exampleUrl)
      .reply(200, {
        "aaa": 1,
        "bbb": 3,
        "ccc": { "$href": "#/aaa" }
      }, { "Content-Type": "application/reference+json" });

    doc = Hyperjump.fetch(`${host}${exampleUrl}`);
  });

  after(nock.cleanAll);

  When("calling allValues on the document", () => {
    let subject;

    before(async () => {
      subject = Hyperjump.allValues(await doc);
    });

    Then("it should return an object with all promises resolved", async () => {
      expect(await subject).to.eql({
        aaa: 1,
        bbb: 3,
        ccc: 1
      });
    });
  });
});
