const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require(".");
const nock = require("nock");


Given("a pipeline", () => {
  let subject;

  before(() => {
    subject = Hyperjump.pipeline([
      Hyperjump.filter(async (a) => await a > 111),
      Hyperjump.map(async (a) => await a * 2),
      Hyperjump.reduce(async (sum, a) => sum + await a, 0)
    ]);
  });

  When("passed a JRef document", () => {
    let doc;

    before(async () => {
      const host = "http://pipeline.hyperjump.io";
      const exampleUrl = "/example1";
      nock(host)
        .get(exampleUrl)
        .reply(200, {
          "foo": "bar",
          "aaa": {
            "bbb": 222,
            "$href": "#/foo"
          },
          "ccc": { "$href": "#/aaa" },
          "ddd": {
            "111": 111,
            "222": { "$href": "#/aaa/bbb" }
          },
          "eee": [333, 222, { "$href": "#/ddd/111" }],
          "fff": {
            "$embedded": "http://json-reference.hyperjump.io/example2",
            "abc": 123
          }
        }, { "Content-Type": "application/reference+json" });

      doc = Hyperjump.fetch(`${host}${exampleUrl}`);
    });

    after(nock.cleanAll);

    Then("it should return the expected result", async () => {
      expect(await subject(doc.eee)).to.equal(1110);
    });
  });

  When("passed a JSON document", () => {
    let doc;

    before(async () => {
      const host = "http://pipeline.hyperjump.io";
      const exampleUrl = "/example2";
      nock(host)
        .get(exampleUrl)
        .reply(200, {
          "eee": [333, 222, 111]
        }, { "Content-Type": "application/json" });

      doc = Hyperjump.fetch(`${host}${exampleUrl}`);
    });

    after(nock.cleanAll);

    Then("it should return the expected result", async () => {
      expect(await subject(doc.eee)).to.equal(1110);
    });
  });

  When("passed normal data", () => {
    let doc;

    before(async () => {
      doc = {
        eee: [333, 222, 111]
      };
    });

    after(nock.cleanAll);

    Then("it should return the expected result", async () => {
      expect(await subject(doc.eee)).to.equal(1110);
    });
  });
});
