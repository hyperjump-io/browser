const { expect } = require("chai");
const { Given, When, Then } = require("../mocha-gherkin.spec");
const JsonReference = require(".");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;

  before(async () => {
    const exampleUrl = "http://json-reference.hyperjump.io/example1";
    nock("http://json-reference.hyperjump.io")
      .get("/example1")
      .reply(200, {
        "foo": "bar",
        "aaa": {
          "bbb": 222,
          "$ref": "#/foo"
        },
        "ccc": { "$ref": "#/aaa" },
        "ddd": {
          "111": 111,
          "222": { "$ref": "#/aaa/bbb" }
        },
        "eee": ["a", { "$ref": "#/ddd/111" }],
        "fff": {
          "$id": "http://json-reference.hyperjump.io/example2",
          "abc": 123
        }
      }, { "Content-Type": "application/reference+json" })
      .persist();

    doc = await JsonReference.get(exampleUrl);
  });

  after(nock.cleanAll);

  When("pointing to a normal plain JSON element", () => {
    let subject;

    before(async () => {
      subject = await JsonReference.get("#/foo", doc);
    });

    Then("it should have the value that is pointed to", () => {
      expect(JsonReference.value(subject)).to.equal("bar");
    });

    Then("it should have the pointer that was given", () => {
      expect(JsonReference.pointer(subject)).to.equal("/foo");
    });
  });

  When("pointing to an element with a $ref", () => {
    let subject;

    before(async () => {
      subject = await JsonReference.get("#/aaa", doc);
    });

    Then("it should follow the $ref", () => {
      expect(JsonReference.value(subject)).to.equal("bar");
    });

    Then("it should have the pointer in the $ref", () => {
      expect(JsonReference.pointer(subject)).to.equal("/foo");
    });
  });

  When("pointing to an element that has a $ref sibling", () => {
    let subject;

    before(async () => {
      subject = await JsonReference.get("#/aaa/bbb", doc);
    });

    Then("it should have the value that is pointed to", () => {
      expect(JsonReference.value(subject)).to.equal(222);
    });

    Then("it should have the pointer that was given", () => {
      expect(JsonReference.pointer(subject)).to.equal("/aaa/bbb");
    });
  });

  When("pointing to an element with an $id", () => {
    let subject;

    before(async () => {
      subject = await JsonReference.get("#/fff", doc);
    });

    Then("it should return a new document using the $id as URL", () => {
      expect(JsonReference.value(subject)).to.eql({ "abc": 123 });
    });
  });

  When("mapping over an array", () => {
    let subject;

    before(async () => {
      subject = await JsonReference.get("#/eee", doc);
    });

    Then("it should apply the function to every item in the array", async () => {
      const types = await JsonReference.map((item) => typeof JsonReference.value(item), subject);
      expect(types).to.eql(["string", "number"]);
    });
  });

  When("getting entries of an object", () => {
    let subject;

    before(async () => {
      subject = await JsonReference.get("#/ddd", doc);
    });

    Then("it should return key/document pairs", async () => {
      const one = await JsonReference.get("#/ddd/111", doc);
      const two = await JsonReference.get("#/ddd/222", doc);
      const expected = [["111", one], ["222", two]];

      expect(await JsonReference.entries(subject)).to.eql(expected);
    });
  });
});
