const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require(".");
const nock = require("nock");


Given("a Hyperjump browser", () => {
  let browser;
  const host = "http://set.hyperjump.io";
  const exampleUrl = "/example1";

  before(() => {
    nock(host)
      .get(exampleUrl)
      .reply(200, {
        "aaa": 111,
        "bbb": { "$href": "#/aaa" }
      }, { "Content-Type": "application/reference+json" });

    browser = Hyperjump.fetch(`${host}${exampleUrl}`);
  });

  after(nock.cleanAll);

  When("setting a value and the response is not empty", () => {
    before(async () => {
      nock(host)
        .put(exampleUrl, {
          "aaa": 222,
          "bbb": { "$href": "#/aaa" }
        })
        .reply(200, {
          "aaa": 222,
          "bbb": { "$href": "#/aaa" }
        }, { "Content-Type": "application/reference+json" });

      await browser.bbb.$set(222);
    });

    Then("the value should be updated with out an additional request", async () => {
      expect(await browser.aaa).to.equal(222);
      expect(await browser.bbb).to.equal(222);
    });
  });

  //When("setting a value and the response is empty", () => {
    //before(async () => {
      //nock(host)
        //.put(exampleUrl, {
          //"aaa": 222,
          //"bbb": { "$href": "#/aaa" }
        //})
        //.reply(204);

      //nock(host)
        //.get(exampleUrl)
        //.reply(200, {
          //"aaa": 222,
          //"bbb": { "$href": "#/aaa" }
        //}, { "Content-Type": "application/reference+json" });

      //await browser.bbb.$set(222);
    //});

    //Then("the value should be updated", async () => {
      //expect(await browser.aaa).to.equal(222);
      //expect(await browser.bbb).to.equal(222);
    //});
  //});
});
