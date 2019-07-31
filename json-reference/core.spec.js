const { expect } = require("chai");
const { Given, When, Then } = require("../mocha-gherkin.spec");
const Hyperjump = require("..");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;

  before(() => {
    const exampleUrl = "http://json-reference.hyperjump.io/example1";
    nock("http://json-reference.hyperjump.io")
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
        "eee": [333, { "$href": "#/ddd/111" }],
        "fff": {
          "$embedded": "http://json-reference.hyperjump.io/example2",
          "abc": 123
        }
      }, { "Content-Type": "application/reference+json" });

    doc = Hyperjump.fetch(exampleUrl);
  });

  after(nock.cleanAll);

  When("pointing to a normal plain JSON value", () => {
    let subject;

    before(async () => {
      subject = await doc.foo;
    });

    Then("it should have the value that is pointed to", () => {
      expect(subject).to.equal("bar");
    });
  });

  When("pointing to an element with a $href", () => {
    let subject;

    before(async () => {
      subject = await doc.aaa;
    });

    Then("it should follow the $href", () => {
      expect(subject).to.equal("bar");
    });
  });

  When("pointing to an element with an $embedded document", () => {
    let subject;

    before(async () => {
      subject = await doc.fff;
    });

    Then("it should return a new document using the $embedded as URL", async () => {
      expect(await subject.abc).to.eql(123);
    });
  });

  When("stepping into a document whose value is an array", () => {
    let subject;

    before(async () => {
      const eee = doc.eee;
      subject = eee[1];
    });

    Then("it should return the element in the array that was indicated", async () => {
      expect(await subject).to.eql(111);
    });
  });

  When("stepping into a document whose value is an object", () => {
    let subject;

    before(async () => {
      subject = await doc.foo;
    });

    Then("it should return the element in the object that was indicated", async () => {
      expect(subject).to.eql("bar");
    });
  });
});
