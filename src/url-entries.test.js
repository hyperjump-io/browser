import { describe, test, expect } from "vitest";
import { urlEntries, valuesFor } from "./url-entries.js";

describe("URL entries", () => {
  test("a key that ends with / is for every URL under it, and any other only for itself", () => {
    const entries = urlEntries({ "https://a.test/docs/": "docs", "https://a.test/page": "page" });
    expect(valuesFor(entries, "https://a.test/docs/x/y")).to.eql(["docs"]);
    expect(valuesFor(entries, "https://a.test/docs/")).to.eql(["docs"]);
    expect(valuesFor(entries, "https://a.test/docs")).to.eql([]);
    expect(valuesFor(entries, "https://a.test/page")).to.eql(["page"]);
    expect(valuesFor(entries, "https://a.test/page/x"), "a key without / isn't a prefix").to.eql([]);
    expect(valuesFor(entries, "https://a.test/pages")).to.eql([]);
  });

  test("an origin without a path is for the whole origin", () => {
    const entries = urlEntries({ "https://a.test": "a" });
    expect(valuesFor(entries, "https://a.test/x/y")).to.eql(["a"]);
    expect(valuesFor(entries, "https://a.test.evil.test/"), "another host that starts the same").to.eql([]);
    expect(valuesFor(entries, "https://a.test@evil.test/"), "userinfo that looks like the host").to.eql([]);
    expect(valuesFor(entries, "https://a.test:8443/"), "another port").to.eql([]);
  });

  test("URLs are compared parsed, without fragments", () => {
    const entries = urlEntries({ "HTTPS://A.test:443/docs/#top": "docs" });
    expect(valuesFor(entries, "https://a.test/docs/x#y")).to.eql(["docs"]);
    expect(valuesFor(entries, "https://a.test/docs/../secret"), "dot segments").to.eql([]);
  });

  test("a key with a query is only for itself", () => {
    const entries = urlEntries({ "https://a.test/?path=/": "query" });
    expect(valuesFor(entries, "https://a.test/?path=/")).to.eql(["query"]);
    expect(valuesFor(entries, "https://a.test/?path=/x")).to.eql([]);
  });

  test("values are from the shortest key to the longest", () => {
    const entries = urlEntries({ "https://a.test/a/b/": 3, "https://a.test/": 1, "https://a.test/a/": 2 });
    expect(valuesFor(entries, "https://a.test/a/b/c")).to.eql([1, 2, 3]);
  });

  test("a relative key is resolved against the base", () => {
    const entries = urlEntries({ "api/": "api" }, new URL("https://a.test/v1/"));
    expect(valuesFor(entries, "https://a.test/v1/api/x")).to.eql(["api"]);
  });

  test("a key that isn't a URL, or is relative without a base, throws", () => {
    expect(() => urlEntries({ "api/": 1 })).to.throw(TypeError, /no base URL/);
    expect(() => urlEntries({ "http://[": 1 }, new URL("https://a.test/"))).to.throw(TypeError, /isn't a URL/);
  });
});
