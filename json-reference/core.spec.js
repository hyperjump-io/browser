const { expect } = require("chai");
const { Given, When, Then } = require("../mocha-gherkin.spec");
const JRef = require(".");
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

    doc = JRef.get(exampleUrl, JRef.nil);
  });

  after(nock.cleanAll);

  When("pointing to a normal plain JSON value", () => {
    let subject;

    before(async () => {
      subject = await JRef.get("#/foo", doc);
    });

    Then("it should have the value that is pointed to", () => {
      expect(JRef.value(subject)).to.equal("bar");
    });
  });

  When("pointing to an element with a $href", () => {
    let subject;

    before(async () => {
      subject = await JRef.get("#/aaa", doc);
    });

    Then("it should follow the $href", () => {
      expect(JRef.value(subject)).to.equal("bar");
    });
  });

  When("pointing to an element that has a $href sibling", () => {
    let subject;

    before(async () => {
      subject = await JRef.get("#/aaa/bbb", doc);
    });

    Then("it should have the value that is pointed to", () => {
      expect(JRef.value(subject)).to.equal(222);
    });
  });

  When("pointing to an element with an $embedded document", () => {
    let subject;

    before(async () => {
      subject = await JRef.get("#/fff", doc);
    });

    Then("it should return a new document using the $embedded as URL", () => {
      expect(JRef.value(subject)).to.eql({ "abc": 123 });
    });
  });

  When("stepping into a document whose value is an array", () => {
    let subject;

    before(async () => {
      const eee = JRef.get("#/eee", doc);
      subject = await JRef.step("1", eee);
    });

    Then("it should return the element in the array that was indicated", async () => {
      const expected = await JRef.get("#/ddd/111", doc);
      expect(subject).to.eql(expected);
    });
  });

  When("stepping into a document whose value is an object", () => {
    let subject;

    before(async () => {
      subject = await JRef.step("foo", doc);
    });

    Then("it should return the element in the object that was indicated", async () => {
      const expected = await JRef.get("#/foo", doc);
      expect(subject).to.eql(expected);
    });
  });
});
