import { expect } from "chai";
import { Given, When, Then } from "~/mocha-gherkin.spec";
import * as Core from "~/core";
import nock from "nock";


Given("the nil browser", () => {
  const doc = Core.nil;

  When("a document is retrieved", () => {
    let subject;

    before(async () => {
      const exampleUrl = "http://core.hyperjump.io/example1";
      nock("http://core.hyperjump.io")
        .get("/example1")
        .reply(200, "foo")
        .persist();

      subject = await Core.get(exampleUrl, doc);
    });

    after(nock.cleanAll);

    Then("it's source should be the unprocessed body of the response", () => {
      expect(Core.source(subject)).to.equal("foo");
    });
  });
});
