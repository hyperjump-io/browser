import { expect } from "chai";
import { Given, When, Then } from "~/mocha-gherkin.spec";
import * as JsonReference from "~/json-reference";
import nock from "nock";


Given("a JSON Reference document", () => {
  let doc;

  before(async () => {
    const exampleUrl = "http://json-reference.hyperjump.com/example1";
    nock("http://json-reference.hyperjump.com")
      .get("/example1")
      .reply(200, {
        "foo": "bar",
        "aaa": {
          "bbb": 222,
          "$ref": "#/foo"
        },
        "ccc": { "$ref": "#/aaa" }
      })
      .persist();

    doc = await JsonReference.get(exampleUrl);
  });

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
});
