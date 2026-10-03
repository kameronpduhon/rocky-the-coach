import { describe, expect, it } from "vitest";
import { targets } from "~/db/schema";
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
});
