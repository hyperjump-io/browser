const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require("./natural");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;
  let positiveNumbersOf;

  before(async () => {
    const host = "http://filter.hyperjump.io";
    const exampleUrl = "/example1";
    nock(host)
      .get(exampleUrl)
      .reply(200, {
        "aaa": [333, -222, { "$href": "#/bbb" }, { "$href": "#/ccc" }],
        "bbb": 222,
        "ccc": -111
      }, { "Content-Type": "application/reference+json" });

    doc = Hyperjump.get(`${host}${exampleUrl}#/aaa`, Hyperjump.nil);
    positiveNumbersOf = Hyperjump.filter(async (item) => await item > 0);
  });

  after(nock.cleanAll);

  When("filtering a document whose value is an array", () => {
    let subject;

    before(async () => {
      subject = await positiveNumbersOf(doc);
    });

    Then("it should return only the positive numbers", async () => {
      expect(await Promise.all(subject)).to.eql([await doc[0], await doc[2]]);
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
