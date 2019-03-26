const { expect } = require("chai");
const { Given, When, Then } = require("../mocha-gherkin.spec");
const JRef = require(".");
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

    doc = await JRef.get(exampleUrl, JRef.nil);
  });

  after(nock.cleanAll);

  When("pointing to a normal plain JSON element", () => {
    let subject;

    before(async () => {
      subject = await JRef.get("#/foo", doc);
    });

    Then("it should have the value that is pointed to", () => {
      expect(JRef.value(subject)).to.equal("bar");
    });

    Then("it should have the pointer that was given", () => {
      expect(JRef.pointer(subject)).to.equal("/foo");
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

    Then("it should have the pointer in the $href", () => {
      expect(JRef.pointer(subject)).to.equal("/foo");
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

    Then("it should have the pointer that was given", () => {
      expect(JRef.pointer(subject)).to.equal("/aaa/bbb");
    });
  });

  When("pointing to an element with an $embedded", () => {
    let subject;

    before(async () => {
      subject = await JRef.get("#/fff", doc);
    });

    Then("it should return a new document using the $embedded as URL", () => {
      expect(JRef.value(subject)).to.eql({ "abc": 123 });
    });
  });

  When("the document is applied to a pipeline that sums numbers at #/eee", () => {
    let subject;

    before(async () => {
      const go = JRef.pipeline([
        JRef.get("#/eee"),
        JRef.map(JRef.value),
        JRef.reduce((sum, a) => sum + a, 0)
      ]);

      subject = await go(doc);
    });

    Then("the result should be the sum of the numbers", () => {
      expect(subject).to.equal(444);
    });
  });
});
