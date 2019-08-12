const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require(".");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;

  before(async () => {
    const host = "http://all.hyperjump.io";
    const exampleUrl = "/example1";
    nock(host)
      .get(exampleUrl)
      .reply(200, [
        1,
        3,
        { "$href": "#/0" }
      ], { "Content-Type": "application/reference+json" });

    doc = Hyperjump.fetch(`${host}${exampleUrl}`);
  });

  after(nock.cleanAll);

  When("calling all on the document", () => {
    let subject;

    before(async () => {
      subject = Hyperjump.all(await doc);
    });

    Then("it should return an array with all promises resolved", async () => {
      expect(await subject).to.eql([1, 3, 1]);
    });
  });
});
