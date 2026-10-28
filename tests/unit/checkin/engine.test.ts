import { describe, expect, it } from "vitest";
import { hungryTwice, weekCall } from "~/checkin/engine";
import { checkInRow, rowsOf, threeWeeks } from "./fixture";

describe("weekCall", () => {
  it("gives N3's worked example from rows: a settling cut of 100", () => {
    const wc = weekCall(rowsOf(threeWeeks()), "2026-10-19", { hungry: false });
    // Trend 205.092 on Sunday, 205.508 the Sunday before.
    expect(wc).toMatchObject({ monday: "2026-10-19", sunday: "2026-10-25", trendWeight: 205.1, change: -0.4, avgSteps: 7700, rampedStepGoal: 7500, thisWeekKcal: 2400 });
    expect(wc.energy).toMatchObject({ burn: 2680, state: "settling", updates: 1, intakeAvg: 2400, trackedDays: 6, windowTrackedDays: 20, weighIns: 21 });
    // The facts N3's callView reads: no targets rows, so the plan's 2,400, 7,000 and 180.
    expect(wc).toMatchObject({ lastBurn: 2800, kcal: 2400, stepGoal: 7000, proteinG: 180, weekNumber: 3 });
    // Ideal: 2,680 - 0.005 x 205.092 x 3,500 / 7 = 2,167, down to 2,150. Settling moves 100. Walking: 7,000 + 1,000.
    expect(wc.call).toMatchObject({ kind: "cut", ideal: 2150, guardrail: null, pick: "calories", hungry: false, calories: { kcal: 2300, stepGoal: 7500 }, steps: { kcal: 2400, stepGoal: 8000 } });
  });

  it("passes hunger to the call", () => {
    expect(weekCall(rowsOf(threeWeeks()), "2026-10-19", { hungry: true }).call).toMatchObject({ kind: "cut", pick: "steps", hungry: true, calories: { kcal: 2300 } });
  });

  it("holds at the plan's burn before the phase starts", () => {
    const wc = weekCall(rowsOf(threeWeeks()), "2026-09-28", { hungry: false });
    expect(wc.energy).toMatchObject({ state: "holding", burn: 2800, updates: 0 });
    expect(wc).toMatchObject({ trendWeight: null, change: null, lastBurn: 2800 });
    expect(wc.call).toMatchObject({ kind: "hold", steps: null });
  });
});

describe("hungryTwice", () => {
  it("needs High now and High saved last week; a skipped week breaks the run", () => {
    const t = threeWeeks();
    t.check_ins = [checkInRow("2026-10-12", { hunger: "high" }), checkInRow("2026-10-05", { hunger: "high" })];
    const rows = rowsOf(t);
    expect(hungryTwice(rows, "2026-10-19", "high")).toBe(true);
    expect(hungryTwice(rows, "2026-10-19", "fine")).toBe(false);
    expect(hungryTwice(rows, "2026-10-19", null)).toBe(false);
    // Oct 19 was skipped, so Oct 26's High follows nothing.
    expect(hungryTwice(rows, "2026-10-26", "high")).toBe(false);
  });
});
