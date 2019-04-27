const { expect } = require("chai");
const { Given, When, Then } = require("../mocha-gherkin.spec");
const Hyperjump = require("./core");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;

  before(() => {
    nock("http://natural.hyperjump.io")
      .get("/example1")
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

    doc = Hyperjump.get("http://natural.hyperjump.io/example1", Hyperjump.nil);
  });

  after(nock.cleanAll);

  When("stepping into an object", () => {
    let subject;

    before(async () => {
      subject = await doc.foo;
    });

    Then("it should return the value of that propertyName stepped into", () => {
      expect(subject).to.equal("bar");
    });
  });

  When("stepping into an object and stepping again", () => {
    let subject;

    before(async () => {
      subject = await doc.ddd["222"];
    });

    Then("it should return the value of the path stepped into", () => {
      expect(subject).to.equal(222);
    });
  });

  When("stepping into an array", () => {
    let subject;

    before(async () => {
      subject = await doc.eee[2];
    });

    Then("it should return the value of the path stepped into", () => {
      expect(subject).to.equal(111);
    });
  });

  When("using pipeline/map/filter/reduce", () => {
    let subject;

    before(() => {
      subject = Hyperjump.pipeline([
        Hyperjump.filter(async (a) => (await a) > 111),
        Hyperjump.map(async (a) => (await a) * 2),
        Hyperjump.reduce(async (sum, a) => sum + (await a), 0)
      ]);
    });

    Then("it should work as expected with the natural API", async () => {
      expect(await subject(doc.eee)).to.equal(1110);
    });
  });
});
