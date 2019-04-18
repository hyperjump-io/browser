const { expect } = require("chai");
const { Given, When, And, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require(".");
const nock = require("nock");


Given("A resource is available as Json and JRef", () => {
  const exampleUrl = "http://core.hyperjump.io/example1";

  before(() => {
    nock("http://core.hyperjump.io")
      .get("/example1")
      .reply(200, {
        "aaa": 111,
        "bbb": 111,
        "ccc": 333
      });

    nock("http://core.hyperjump.io")
      .get("/example1")
      .reply(200, {
        "aaa": 111,
        "bbb": { "$href": "#/aaa" },
        "ccc": 333
      }, { "Content-Type": "application/reference+json" });
  });

  after(nock.cleanAll);

  When("the document is fetched as JSON", () => {
    let doc;

    before(() => {
      doc = Hyperjump.get(exampleUrl, Hyperjump.nil);
    });

    Then("it's source should be the unprocessed body of the response", async () => {
      expect(Hyperjump.source(await doc)).to.equal(`{"aaa":111,"bbb":111,"ccc":333}`);
    });

    And("the document is applied to a pipeline that sums numbers", () => {
      let subject;

      before(async () => {
        const go = Hyperjump.pipeline([
          Hyperjump.map(Hyperjump.value),
          Hyperjump.reduce((sum, a) => sum + a, 0)
        ]);

        subject = await go(doc);
      });

      Then("the result should be the sum of the numbers", () => {
        expect(subject).to.equal(555);
      });
    });
  });

  When("the document is fetched as JRef", () => {
    let doc;

    before(() => {
      doc = Hyperjump.get(exampleUrl, Hyperjump.nil, {
        headers: { "Accept": "application/reference+json" }
      });
    });

    Then("it's source should be the unprocessed body of the response", async () => {
      expect(Hyperjump.source(await doc)).to.equal(`{"aaa":111,"bbb":{"$href":"#/aaa"},"ccc":333}`);
    });

    And("the document is applied to a pipeline that sums numbers", () => {
      let subject;

      before(async () => {
        const go = Hyperjump.pipeline([
          Hyperjump.map(Hyperjump.value),
          Hyperjump.reduce((sum, a) => sum + a, 0)
        ]);

        subject = await go(doc);
      });

      Then("the result should be the sum of the numbers", () => {
        expect(subject).to.equal(555);
      });
    });
  });
});
