const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require(".");
const nock = require("nock");


Given("a Hyperjump document", () => {
  let doc;
  const host = "http://core.hyperjump.io";
  const exampleUrl = "/example1";

  before(() => {
    nock(host)
      .get(exampleUrl)
      .reply(200, {
        "foo": {
          "aaa": 111,
          "bbb": { "$href": "#/foo/aaa" }
        }
      }, { "Content-Type": "application/reference+json" });

    doc = Hyperjump.fetch(`${host}${exampleUrl}`);
  });

  after(nock.cleanAll);

  Then("the URL can be retrieved", async () => {
    expect(await doc.$url).to.equal(`${host}${exampleUrl}`);
  });

  When("following a link", () => {
    let subject;

    before(() => {
      subject = doc.$follow("#/foo");
    });

    Then("the url of the resulting document should be the resolved url", async () => {
      expect(await subject.$url).to.equal(`${host}${exampleUrl}#/foo`);
    });
  });

  Then("the source is the raw value of the document", async () => {
    expect(await doc.$source).to.eql({
      "foo": {
        "aaa": 111,
        "bbb": { "$href": "#/foo/aaa" }
      }
    });
  });
});

Given("a JSON Reference document", () => {
  let doc;

  before(() => {
    const host = "http://core.hyperjump.io";
    const exampleUrl = "/example2";
    nock(host)
      .get(exampleUrl)
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
        "eee": [333, 222, { "$href": "#/ddd/111" }],
        "fff": {
          "$embedded": "http://core.hyperjump.io/example3",
          "abc": 123
        }
      }, { "Content-Type": "application/reference+json" });

    doc = Hyperjump.fetch(`${host}${exampleUrl}`);
  });

  after(nock.cleanAll);

  When("stepping into an object", () => {
    let subject;

    before(async () => {
      subject = await doc.foo;
    });

    Then("it should return the value of that propertyName stepped into", () => {
      expect(subject).to.equal("bar");
    });
  });

  When("stepping into an object and stepping again", () => {
    let subject;

    before(async () => {
      subject = await doc.ddd["222"];
    });

    Then("it should return the value of the path stepped into", () => {
      expect(subject).to.equal(222);
    });
  });

  When("stepping into an array", () => {
    let subject;

    before(async () => {
      subject = await doc.eee[2];
    });

    Then("it should return the value of the path stepped into", () => {
      expect(subject).to.equal(111);
    });
  });
});

Given("a JSON document", () => {
  let doc;

  before(() => {
    const host = "http://core.hyperjump.io";
    const exampleUrl = "/example4";
    nock(host)
      .get(exampleUrl)
      .reply(200, {
        "foo": "bar",
        "aaa": {
          "bbb": 222
        },
        "eee": [333, 222, 111]
      }, { "Content-Type": "application/json" });

    doc = Hyperjump.fetch(`${host}${exampleUrl}`);
  });

  after(nock.cleanAll);

  When("stepping into an object", () => {
    let subject;

    before(async () => {
      subject = await doc.foo;
    });

    Then("it should return the value of that propertyName stepped into", () => {
      expect(subject).to.equal("bar");
    });
  });

  When("stepping into an object and stepping again", () => {
    let subject;

    before(async () => {
      subject = await doc.aaa.bbb;
    });

    Then("it should return the value of the path stepped into", () => {
      expect(subject).to.equal(222);
    });
  });

  When("stepping into an array", () => {
    let subject;

    before(async () => {
      subject = await doc.eee[2];
    });

    Then("it should return the value of the path stepped into", () => {
      expect(subject).to.equal(111);
    });
  });
});

Given("A resource is available as Json and JRef", () => {
  const host = "http://core.hyperjump.io";
  const exampleUrl = "/example5";

  before(() => {
    nock(host)
      .get(exampleUrl)
      .reply(200, {
        "aaa": 111,
        "bbb": 222,
        "ccc": 333
      }, { "Content-Type": "application/json; charset=utf-8" });

    nock(host)
      .get(exampleUrl)
      .reply(200, {
        "aaa": 111,
        "bbb": { "$href": "#/aaa" },
        "ccc": 333
      }, { "Content-Type": "application/reference+json; charset=utf-8" });
  });

  after(nock.cleanAll);

  When("the document is fetched as JSON", () => {
    let doc;

    before(() => {
      doc = Hyperjump.fetch(`${host}${exampleUrl}`, {
        headers: { "Accept": "application/json" }
      });
    });

    Then("the you should recieve the JSON document", async () => {
      expect(await doc.bbb).to.equal(222);
    });
  });

  When("the document is fetched as JRef", () => {
    let doc;

    before(() => {
      doc = Hyperjump.fetch(`${host}${exampleUrl}`, {
        headers: { "Accept": "application/reference+json" }
      });
    });

    Then("the you should recieve the JRef document", async () => {
      expect(await doc.bbb).to.equal(111);
    });
  });
});

Given("a Hyperjump error document", () => {
  let doc;
  const host = "http://core.hyperjump.io";
  const exampleUrl = "/example6";

  before(() => {
    nock(host)
      .get(exampleUrl)
      .reply(404, {
        "errorMessage": "Not Found"
      }, { "Content-Type": "application/reference+json" });

    doc = Hyperjump.fetch(`${host}${exampleUrl}`);
  });

  after(nock.cleanAll);

  Then("the exception should be an error", async () => {
    try {
      await doc;
      expect.fail("exception expected but none thrown");
    } catch (error) {
      expect(await error.errorMessage).to.eql("Not Found");
    }
  });
});
