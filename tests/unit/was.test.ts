import { describe, expect, it } from "vitest";
import { recentTargetChange, wasReason, type TargetChange } from "~/content/was";

// Sunday Oct 25's check-in trimmed 100 cal a day from Monday Oct 26.
const cut = [{ effectiveFrom: "2026-10-26", kcal: 2300, proteinG: 180, stepGoal: 8500 }];

describe("recentTargetChange", () => {
  it("finds a change for the 7 days from the day it lands", () => {
    expect(recentTargetChange(cut, "2026-10-26")).toEqual({ on: "2026-10-26", fromKcal: 2400, toKcal: 2300, maintenance: null });
    expect(recentTargetChange(cut, "2026-11-01")?.on).toBe("2026-10-26");
    expect(recentTargetChange(cut, "2026-11-02")).toBeNull();
    expect(recentTargetChange([], "2026-10-28")).toBeNull();
  });

  it("tells a maintenance week from a check-in", () => {
    // Week 12 (maintenance) starts Monday Dec 21, and week 13 on Dec 28.
    expect(recentTargetChange([], "2026-12-21")).toEqual({ on: "2026-12-21", fromKcal: 2400, toKcal: 2800, maintenance: "start" });
    expect(recentTargetChange([], "2026-12-28")).toEqual({ on: "2026-12-28", fromKcal: 2800, toKcal: 2400, maintenance: "end" });
  });
});

describe("wasReason", () => {
  const trim: TargetChange = { on: "2026-10-26", fromKcal: 2400, toKcal: 2300, maintenance: null };

  it("names the check-in and at most two of the flex foods that moved", () => {
    expect(wasReason(trim, ["white-rice-cooked", "honey"])).toBe("Sunday's check-in trimmed 100 cal a day, so rice and honey took the cut.");
    expect(wasReason(trim, ["potato-russet-raw", "butter", "olive-oil"])).toBe("Sunday's check-in trimmed 100 cal a day, so potato and butter took the cut.");
    expect(wasReason({ ...trim, fromKcal: 2300, toKcal: 2450 }, ["white-rice-cooked"])).toBe("Sunday's check-in added 150 cal a day, so rice goes up.");
  });

  it("explains a maintenance week and its end", () => {
    expect(wasReason({ on: "2026-12-21", fromKcal: 2400, toKcal: 2800, maintenance: "start" }, ["white-rice-cooked", "butter"])).toBe("Maintenance week adds 400 cal a day, so rice and butter go up.");
    expect(wasReason({ on: "2026-12-28", fromKcal: 2800, toKcal: 2400, maintenance: "end" }, ["honey"])).toBe("Maintenance week is over, so honey comes back down.");
  });
});
