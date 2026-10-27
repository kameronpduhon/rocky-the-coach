import { describe, expect, it } from "vitest";
import { dayResults } from "~/server/history.server";
import { logOffPlan } from "~/server/meals.server";
import { db } from "./helpers";

describe("dayResults", () => {
  it("counts an off-plan dessert against the day only past the week's two", async () => {
    const now = new Date("2026-10-27T20:00:00Z");
    for (const date of ["2026-10-26", "2026-10-27", "2026-10-28"]) {
      await logOffPlan(db(), date, { name: "Cookie", category: "dessert", kcal: 200, proteinG: 2, relaxed: false }, now);
    }
    const days = await dayResults(db(), "2026-10-26", "2026-10-28");
    expect(days.map((d) => d.offPlanDessert)).toEqual([false, false, true]);
  });
});
