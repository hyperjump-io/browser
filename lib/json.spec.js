const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Json = require("./json");
const nock = require("nock");


Given("the nil browser", () => {
  const doc = Json.nil;

  When("a JSON document is retrieved", () => {
    let subject;

    before(async () => {
      const exampleUrl = "http://json.hyperjump.io/example1";
      nock("http://json.hyperjump.io")
        .get("/example1")
        .reply(200, { "foo": "bar" }, { "Content-Type": "application/json" })
        .persist();

      subject = await Json.get(exampleUrl, doc);
    });

    after(nock.cleanAll);

    Then("it's source should be the unprocessed body of the response", () => {
      expect(Json.source(subject)).to.equal(`{"foo":"bar"}`);
    });

    Then("it's json should be the body parsed as JSON", () => {
      expect(Json.json(subject)).to.eql({ "foo": "bar" });
    });
  });
});
