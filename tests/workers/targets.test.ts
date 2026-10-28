import { describe, expect, it } from "vitest";
import { checkIns, targets } from "~/db/schema";
import { targetsFor } from "~/server/targets.server";
import { db } from "./helpers";

describe("targetsFor", () => {
  it("starts from the plan's starting targets", async () => {
    expect(await targetsFor(db(), "2026-10-12")).toEqual({ kcal: 2400, proteinG: 180, stepGoal: 7000 });
  });

  it("uses the latest row effective on or before the date", async () => {
    await db().insert(targets).values([
      { effectiveFrom: "2026-10-19", kcal: 2400, proteinG: 180, stepGoal: 7500 },
      { effectiveFrom: "2026-11-02", kcal: 2250, proteinG: 180, stepGoal: 8000 },
    ]);
    expect(await targetsFor(db(), "2026-10-25")).toEqual({ kcal: 2400, proteinG: 180, stepGoal: 7500 });
    expect(await targetsFor(db(), "2026-11-05")).toEqual({ kcal: 2250, proteinG: 180, stepGoal: 8000 });
  });

  it("eats at maintenance in the maintenance week", async () => {
    expect((await targetsFor(db(), "2026-12-22")).kcal).toBe(2800);
  });

  it("reports base targets without the maintenance bump", async () => {
    const { baseTargetsFor } = await import("~/server/targets.server");
    expect((await baseTargetsFor(db(), "2026-12-22")).kcal).toBe(2250);
  });

  it("eats at the latest check-in's burn in the maintenance week, then goes back to the base", async () => {
    await db().insert(checkIns).values({ weekStart: "2026-12-14", adherence: 6, outcome: "{}", completedAt: "2026-12-20T23:00:00.000Z", burn: 2650, burnState: "updating", intakeAvg: 2280, trackedDays: 6 });
    expect((await targetsFor(db(), "2026-12-22")).kcal).toBe(2650);
    expect((await targetsFor(db(), "2026-12-28")).kcal).toBe(2250);
  });
});
