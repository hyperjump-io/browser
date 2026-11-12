import { describe, test, expect } from "vitest";
import { defaultStack as nodeStack } from "./default-stack.js";
import { defaultStack as browserStack } from "./default-stack.browser.js";
import { Hyperjump, defaultStack } from "./index.js";
import { layersOf } from "./layers.js";
import { Scheduler } from "./layers/scheduler.js";
import { SchemeTransport } from "./transports/scheme-transport.js";

describe("the default stack", () => {
  test("in Node.js is a scheduler over a transport that has file:", () => {
    const [top, transport, ...rest] = layersOf(nodeStack());
    expect(top).to.be.instanceOf(Scheduler);
    expect(Object.keys(/** @type SchemeTransport */ (transport).schemes).toSorted()).to.eql(["data:", "file:", "http:", "https:"]);
    expect(rest).to.eql([]);
  });

  test("in a browser is the default transport, which the browser limits", () => {
    const stack = browserStack();
    expect(stack).to.be.instanceOf(SchemeTransport);
    expect(Object.keys(/** @type SchemeTransport */ (stack).schemes).toSorted()).to.eql(["data:", "http:", "https:"]);
  });

  test("is made for each session", () => {
    expect(nodeStack()).not.to.equal(nodeStack());
    expect(new Hyperjump().stack).not.to.equal(new Hyperjump().stack);
  });

  test("is shared by the sessions of a configuration that has one", () => {
    const config = { stack: defaultStack() };
    expect(config.stack).to.be.instanceOf(Scheduler);
    expect(new Hyperjump(config).stack).to.equal(new Hyperjump(config).stack);
  });
});
