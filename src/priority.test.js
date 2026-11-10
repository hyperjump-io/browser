import { describe, test, expect } from "vitest";
import { PriorityController, PriorityGroup, PrioritySignal, priorityRank } from "./priority.js";

describe("priorities", () => {
  test("they're served high, then auto, then low", () => {
    expect(priorityRank.high).to.be.lessThan(priorityRank.auto);
    expect(priorityRank.auto).to.be.lessThan(priorityRank.low);
  });

  test("a controller changes its signal and dispatches change", () => {
    const controller = new PriorityController("low");
    let changes = 0;
    controller.signal.addEventListener("change", () => changes++);
    controller.set("high");
    expect(controller.signal.value).to.equal("high");
    controller.set("high");
    expect(changes, "setting the same value doesn't dispatch").to.equal(1);
  });

  test("a controller's default is auto", () => {
    expect(new PriorityController().signal.value).to.equal("auto");
  });

  test("a signal of a value doesn't change", () => {
    expect(PrioritySignal.of("low").value).to.equal("low");
  });

  describe("a group", () => {
    test("is the most urgent of its members", () => {
      const group = new PriorityGroup();
      const a = new PriorityController("low");
      group.add(a.signal);
      expect(group.signal.value).to.equal("low");
      group.add(PrioritySignal.of("auto"));
      expect(group.signal.value).to.equal("auto");
      a.set("high");
      expect(group.signal.value).to.equal("high");
    });

    test("is the most urgent of the rest when a member leaves", () => {
      const group = new PriorityGroup();
      const leaveHigh = group.add(PrioritySignal.of("high"));
      group.add(PrioritySignal.of("auto"));
      leaveHigh();
      expect(group.signal.value).to.equal("auto");
    });

    test("ignores a member that left", () => {
      const group = new PriorityGroup();
      const a = new PriorityController("low");
      const leave = group.add(a.signal);
      group.add(PrioritySignal.of("auto"));
      leave();
      leave();
      a.set("high");
      expect(group.signal.value).to.equal("auto");
    });

    test("keeps its last value when it has no members", () => {
      const group = new PriorityGroup();
      const leave = group.add(PrioritySignal.of("high"));
      leave();
      expect(group.signal.value).to.equal("high");
    });

    test("counts a member added twice until it leaves twice", () => {
      const group = new PriorityGroup();
      const high = PrioritySignal.of("high");
      const leave1 = group.add(high);
      group.add(high);
      group.add(PrioritySignal.of("low"));
      leave1();
      expect(group.signal.value).to.equal("high");
    });
  });
});
