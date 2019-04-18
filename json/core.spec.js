const { expect } = require("chai");
const { Given, When, Then } = require("../mocha-gherkin.spec");
const Json = require(".");
const nock = require("nock");


Given("the nil browser", () => {
  const doc = Json.nil;

  When("a JSON document is retrieved", () => {
    let subject;

    before(async () => {
      const exampleUrl = "http://json.hyperjump.io/example1";
      nock("http://json.hyperjump.io")
        .get("/example1")
        .reply(200, { "foo": "bar" }, { "Content-Type": "application/json" })
        .persist();

      subject = await Json.get(exampleUrl, doc);
    });

    after(nock.cleanAll);

    Then("it's source should be the unprocessed body of the response", () => {
      expect(Json.source(subject)).to.equal(`{"foo":"bar"}`);
    });

    Then("it's json should be the body parsed as JSON", () => {
      expect(Json.value(subject)).to.eql({ "foo": "bar" });
    });
  });
});

Given("a document whose value is an array", () => {
  let doc;

  before(() => {
    const exampleUrl = "http://json.hyperjump.io/step/example2";
    nock("http://json.hyperjump.io")
      .get("/step/example2")
      .reply(200, [111, 222, 333], { "Content-Type": "application/json" });

    doc = Json.get(`${exampleUrl}`, Json.nil);
  });

  after(nock.cleanAll);

  When("stepping into the document", () => {
    let subject;

    before(async () => {
      subject = await Json.step("2", doc);
    });

    Then("it should return the element in the array that was indicated", () => {
      expect(subject).to.eql(333);
    });
  });
});

Given("a document whose value is an object", () => {
  let doc;

  before(() => {
    const exampleUrl = "http://json.hyperjump.io/step/example3";
    nock("http://json.hyperjump.io")
      .get("/step/example3")
      .reply(200, {
        "aaa": 111,
        "bbb": 222,
        "ccc": 333
      }, { "Content-Type": "application/json" });

    doc = Json.get(`${exampleUrl}`, Json.nil);
  });

  after(nock.cleanAll);

  When("stepping into the document", () => {
    let subject;

    before(async () => {
      subject = await Json.step("bbb", doc);
    });

    after(nock.cleanAll);

    Then("it should return the element in the object that was indicated", () => {
      expect(subject).to.eql(222);
    });
  });
});
