const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require(".");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;
  let sumOf;

  before(async () => {
    const host = "https://reduce.hyperjump.io";
    const exampleUrl = "/example1";
    nock(host)
      .get(exampleUrl)
      .reply(200, {
        "aaa": [333, { "$href": "#/bbb" }, { "$href": "#/ccc" }],
        "bbb": 222,
        "ccc": 111
      }, { "Content-Type": "application/reference+json" });

    doc = Hyperjump.fetch(`${host}${exampleUrl}#/aaa`);
    sumOf = Hyperjump.reduce(async (sum, item) => sum + await item, 0);
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
