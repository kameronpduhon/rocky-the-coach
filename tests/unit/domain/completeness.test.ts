import { describe, expect, it } from "vitest";
import { dayCompleteness, dayIntake, isTracked } from "~/domain/completeness";
import { SLOTS } from "~/domain/types";

const planned = (slot: string, kcal = 500) => ({ slot, category: "planned", kcal });
const skipped = (slot: string) => ({ slot, category: "skipped", kcal: 0 });
const offPlan = (kcal = 900) => ({ slot: null, category: "meal", kcal });

describe("dayCompleteness", () => {
  it("is not tracked with nothing logged", () => {
    expect(dayCompleteness([])).toBe("untracked");
  });

  it("is complete when every slot is eaten or skipped", () => {
    expect(dayCompleteness(SLOTS.map((s) => planned(s)))).toBe("complete");
    expect(dayCompleteness([...SLOTS.slice(0, 4).map((s) => planned(s)), skipped("dessert")])).toBe("complete");
  });

  it("has estimates when every slot is resolved and something off-plan was logged", () => {
    expect(dayCompleteness([...SLOTS.map((s) => planned(s)), offPlan()])).toBe("estimates");
  });

  it("is partial while any slot is unresolved", () => {
    expect(dayCompleteness([planned("breakfast"), planned("lunch")])).toBe("partial");
    expect(dayCompleteness([offPlan()])).toBe("partial");
  });
});

describe("dayIntake", () => {
  it("adds up a tracked day and gives null for any other", () => {
    expect(dayIntake([...SLOTS.slice(0, 4).map((s) => planned(s)), skipped("dessert"), offPlan(100)])).toBe(2100);
    expect(dayIntake([planned("breakfast")])).toBeNull();
    expect(isTracked("estimates")).toBe(true);
    expect(isTracked("partial")).toBe(false);
  });
});
