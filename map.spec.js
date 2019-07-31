const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require(".");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;
  let double;

  before(async () => {
    const host = "http://map.hyperjump.io";
    const exampleUrl = "/example1";
    nock(host)
      .get(exampleUrl)
      .reply(200, {
        "aaa": [333, { "$href": "#/ccc" }],
        "bbb": { "$href": "#/aaa" },
        "ccc": 111
      }, { "Content-Type": "application/reference+json" });

    doc = Hyperjump.fetch(`${host}${exampleUrl}#/aaa`);
    double = Hyperjump.map(async (item) => await item * 2);
  });

  after(nock.cleanAll);

  When("mapping over a document whose value is an array", () => {
    let subject;

    before(async () => {
      subject = await double(doc);
    });

    Then("it should apply the function to every item in the array", async () => {
      expect(await Promise.all(subject)).to.eql([666, 222]);
    });
  });

  When("mapping over a normal array", () => {
    let subject;

    before(async () => {
      subject = await double([333, 111]);
    });

    Then("it should apply the function to every item in the array", async () => {
      expect(await Promise.all(subject)).to.eql([666, 222]);
    });
  });
});
