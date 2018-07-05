import { expect } from "chai";
import { Given, When, Then } from "~/mocha-gherkin.spec";
import * as JsonReference from "~/json-reference";


Given("a JSON Reference document", () => {
  const doc = JsonReference.load("#", `{
    "foo": "bar",
    "aaa": {
      "bbb": 222,
      "$ref": "#/foo"
    },
    "ccc": {
      "$ref": "#/aaa"
    }
  }`);

  When("pointing to a normal plain JSON element", () => {
    const subject = JsonReference.follow(doc, "#/foo");

    Then("it should have the value that is pointed to", () => {
      expect(JsonReference.value(subject)).to.equal("bar");
    });

    Then("it should have the pointer that was given", () => {
      expect(JsonReference.pointer(subject)).to.equal("/foo");
    });
  });

  When("pointing to an element with a $ref", () => {
    const subject = JsonReference.follow(doc, "#/aaa");

    Then("it should follow the $ref", () => {
      expect(JsonReference.value(subject)).to.equal("bar");
    });

    Then("it should have the pointer in the $ref", () => {
      expect(JsonReference.pointer(subject)).to.equal("/foo");
    });
  });

  When("pointing to an element that has a $ref sibling", () => {
    const subject = JsonReference.follow(doc, "#/aaa/bbb");

    Then("it should have the value that is pointed to", () => {
      expect(JsonReference.value(subject)).to.equal(222);
    });

    Then("it should have the pointer that was given", () => {
      expect(JsonReference.pointer(subject)).to.equal("/aaa/bbb");
    });
  });
});
