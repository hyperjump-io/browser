const { expect } = require("chai");
const { Given, When, Then } = require("../mocha-gherkin.spec");
const Hyperjump = require(".");
const nock = require("nock");


Given("a JSON document whose value is an array", () => {
  let doc;

  before(() => {
    const host = "http://json.hyperjump.io";
    const exampleUrl = "/example1";
    nock(host)
      .get(exampleUrl)
      .reply(200, [111, 222, 333], { "Content-Type": "application/json" });

    doc = Hyperjump.fetch(`${host}${exampleUrl}`);
  });

  after(nock.cleanAll);

  When("stepping into the document", () => {
    let subject;

    before(() => {
      subject = doc[2];
    });

    Then("it should return the element in the array that was indicated", async () => {
      expect(await subject).to.eql(333);
    });
  });
});

Given("a JSON document whose value is an object", () => {
  let doc;

  before(() => {
    const host = "http://json.hyperjump.io";
    const exampleUrl = "/example2";
    nock(host)
      .get(exampleUrl)
      .reply(200, {
        "aaa": 111,
        "bbb": 222,
        "ccc": 333
      }, { "Content-Type": "application/json" });

    doc = Hyperjump.fetch(`${host}${exampleUrl}`);
  });

  after(nock.cleanAll);

  When("stepping into the document", () => {
    let subject;

    before(() => {
      subject = doc.bbb;
    });

    Then("it should return the element in the object that was indicated", async () => {
      expect(await subject).to.eql(222);
    });
  });
});
