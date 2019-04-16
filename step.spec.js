const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const JRef = require(".");


Given("an array", () => {
  const doc = [333, 222, 111];

  When("stepping into an array", () => {
    let subject;

    before(async () => {
      subject = await JRef.step("2", doc);
    });

    Then("it should return the element in the array that was indicated", () => {
      expect(subject).to.eql(111);
    });
  });
});

Given("an array", () => {
  const doc = {
    "aaa": 333,
    "bbb": 222,
    "ccc": 111
  };

  When("stepping into an object", () => {
    let subject;

    before(async () => {
      subject = await JRef.step("bbb", doc);
    });

    Then("it should return the element in the object that was indicated", () => {
      expect(subject).to.eql(222);
    });
  });
});
