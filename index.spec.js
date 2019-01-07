const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require(".");
const nock = require("nock");


Given("the nil browser", () => {
  const doc = Hyperjump.nil;

  When("a document is retrieved", () => {
    let subject;

    before(async () => {
      const exampleUrl = "http://core.hyperjump.io/example1";
      nock("http://core.hyperjump.io")
        .get("/example1")
        .reply(200, "foo")
        .persist();

      subject = await Hyperjump.get(exampleUrl, doc);
    });

    after(nock.cleanAll);

    Then("it's source should be the unprocessed body of the response", () => {
      expect(Hyperjump.source(subject)).to.equal("foo");
    });
  });
});
