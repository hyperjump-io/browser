const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require("./natural");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;

  before(() => {
    nock("http://core.hyperjump.io")
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
        "eee": [333, 222, { "$href": "#/ddd/111" }],
        "fff": {
          "$embedded": "http://json-reference.hyperjump.io/example2",
          "abc": 123
        }
      }, { "Content-Type": "application/reference+json" });

    doc = Hyperjump.get("http://core.hyperjump.io/example1", Hyperjump.nil);
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
    nock("http://core.hyperjump.io")
      .get("/example2")
      .reply(200, {
        "foo": "bar",
        "aaa": {
          "bbb": 222
        },
        "eee": [333, 222, 111]
      }, { "Content-Type": "application/json" });

    doc = Hyperjump.get("http://core.hyperjump.io/example2", Hyperjump.nil);
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
  const exampleUrl = "http://core.hyperjump.io/example3";

  before(() => {
    nock("http://core.hyperjump.io")
      .get("/example3")
      .reply(200, {
        "aaa": 111,
        "bbb": 222,
        "ccc": 333
      }, { "Content-Type": "application/json; charset=utf-8" });

    nock("http://core.hyperjump.io")
      .get("/example3")
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
      doc = Hyperjump.get(exampleUrl, Hyperjump.nil, {
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
      doc = Hyperjump.get(exampleUrl, Hyperjump.nil, {
        headers: { "Accept": "application/reference+json" }
      });
    });

    Then("the you should recieve the JRef document", async () => {
      expect(await doc.bbb).to.equal(111);
    });
  });
});
