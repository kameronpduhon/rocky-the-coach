import { describe, expect, it } from "vitest";
import { burnEntries, maintenanceKcal, resolveTargets } from "~/content/targets";

// Week 12, Monday Dec 21 to Sunday Dec 27, is the maintenance week. Week 13 starts Monday Dec 28.
const cut = [{ effectiveFrom: "2026-10-26", kcal: 2300, proteinG: 180, stepGoal: 8500 }];
const burns = [
  { weekStart: "2026-12-07", burn: 2720 },
  { weekStart: "2026-12-14", burn: 2680 },
];

describe("maintenance week targets", () => {
  it("eat at the latest check-in's burn and keep the base protein and steps", () => {
    expect(resolveTargets(cut, "2026-12-21", burns)).toEqual({ kcal: 2680, proteinG: 180, stepGoal: 8500 });
    expect(resolveTargets(cut, "2026-12-27", burns).kcal).toBe(2680);
  });

  it("fall back to the plan's 2,800 before any check-in has a burn", () => {
    expect(resolveTargets(cut, "2026-12-23", []).kcal).toBe(2800);
  });

  it("ignore a burn from the maintenance week's own check-in", () => {
    expect(maintenanceKcal([...burns, { weekStart: "2026-12-21", burn: 2900 }], "2026-12-23")).toBe(2680);
  });

  it("go back to the base the week after, and never touch other weeks", () => {
    expect(resolveTargets(cut, "2026-12-28", burns).kcal).toBe(2300);
    expect(resolveTargets(cut, "2026-10-28", burns).kcal).toBe(2300);
  });

  it("read burns from check-in rows, skipping v1 rows without one", () => {
    expect(burnEntries([{ week_start: "2026-10-12", burn: null }, { week_start: "2026-10-19", burn: 2680 }])).toEqual([{ weekStart: "2026-10-19", burn: 2680 }]);
  });
});
