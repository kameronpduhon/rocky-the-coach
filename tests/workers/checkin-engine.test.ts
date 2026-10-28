import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { checkIns, mealLogs } from "~/db/schema";
import { addDays } from "~/domain/dates";
import { logWeighIn, upsertSteps } from "~/server/body.server";
import { checkInData, completeCheckIn } from "~/server/checkin.server";
import { targetsFor } from "~/server/targets.server";
import { db } from "./helpers";

const SLOT_KCAL = { breakfast: 500, lunch: 600, snack: 250, dinner: 600, dessert: 450 };

/**
 * The phase's first three weeks, Oct 5 to Oct 25. A weigh-in every day from Sunday Oct 4, the day before the first
 * window, falling 0.07 lb a day (206.0 to 204.5). Every slot eaten from Oct 5, 2,400 a day, except Saturday Oct 24's
 * dessert, which leaves that day partial and out of the math. 7,700 steps a day in week 3.
 */
async function seedThreeWeeks() {
  for (let d = 0; d < 22; d++) {
    const date = addDays("2026-10-04", d);
    await logWeighIn(db(), date, Math.round((206 - 0.07 * d) * 10) / 10, new Date());
    if (date < "2026-10-05") continue;
    const slots = Object.entries(SLOT_KCAL).filter(([slot]) => !(date === "2026-10-24" && slot === "dessert"));
    await db()
      .insert(mealLogs)
      .values(slots.map(([slot, kcal]) => ({ clientId: `seed-${date}-${slot}`, date, slot, mealSlug: null, name: "Seed", category: "planned", kcal, proteinG: 36, loggedAt: `${date}T18:00:00Z` })));
    if (date >= "2026-10-19") await upsertSteps(db(), date, 7700, new Date());
  }
}

const row = async (monday: string) => (await db().select().from(checkIns).where(eq(checkIns.weekStart, monday)).get())!;

describe("the engine's check-in", () => {
  it("reads the burn from three weeks of close-outs and cuts 100 while settling", async () => {
    await seedThreeWeeks();
    const data = await checkInData(db(), "2026-10-19");
    // The trend: 206.0 on Oct 4, 205.508 on Oct 18, 205.092 on Oct 25.
    expect(data.trendWeight).toBe(205.1);
    expect(data.change).toBe(-0.4);
    // Observed: 2,400 + 3,500 x (206.0 - 205.092) / 21 = 2,551. Burn: 2,800 + (2,551 - 2,800) / 2 = 2,676, to 2,680.
    expect(data.energy).toMatchObject({ burn: 2680, state: "settling", updates: 1, intakeAvg: 2400, trackedDays: 6, windowTrackedDays: 20, weighIns: 21 });
    expect(data.lastBurn).toBe(2800);
    expect(data.rampedStepGoal).toBe(7500);
    // Ideal: 2,680 - 512.7 = 2,167, down to 2,150. Settling moves 100.
    expect(data.call).toMatchObject({ kind: "cut", ideal: 2150, guardrail: null, pick: "calories", calories: { kcal: 2300, stepGoal: 7500 }, steps: { kcal: 2400, stepGoal: 8000 } });
    expect(data.thisWeekKcal).toBe(2400);
    expect(data.savedPick).toBeNull();
  });

  it("finishing writes Monday's targets and the engine's fields", async () => {
    await completeCheckIn(db(), "2026-10-19", { waist: null, choice: "calories", rest: [] }, new Date("2026-10-25T23:00:00Z"));
    expect(await targetsFor(db(), "2026-10-26")).toEqual({ kcal: 2300, proteinG: 180, stepGoal: 7500 });
    const saved = await row("2026-10-19");
    expect(saved).toMatchObject({ avgWeight: 205.1, change: -0.4, adherence: expect.any(Number), burn: 2680, burnState: "settling", intakeAvg: 2400, trackedDays: 6 });
    expect(JSON.parse(saved.outcome)).toEqual({ kind: "cut", newKcal: 2300, newStepGoal: 7500, pick: "calories", guardrail: null });
  });

  it("updating with the walking pick keeps the calories and saves the new pick", async () => {
    await completeCheckIn(db(), "2026-10-19", { waist: null, choice: "steps", rest: [] }, new Date("2026-10-26T14:00:00Z"));
    expect(await targetsFor(db(), "2026-10-26")).toEqual({ kcal: 2400, proteinG: 180, stepGoal: 8000 });
    const saved = await row("2026-10-19");
    expect(JSON.parse(saved.outcome)).toEqual({ kind: "cut", newKcal: 2400, newStepGoal: 8000, pick: "steps", guardrail: null });
    expect(saved.completedAt).toBe("2026-10-25T23:00:00.000Z");
    expect((await checkInData(db(), "2026-10-19")).savedPick).toBe("steps");
  });

  it("before the maintenance week, calls the burn and leaves the base alone", async () => {
    // Nothing logged after Oct 25, so every later week holds at 2,680.
    const data = await checkInData(db(), "2026-12-14");
    expect(data.energy).toMatchObject({ state: "holding", burn: 2680 });
    expect(data.call).toMatchObject({ kind: "maintenance", maintenanceKcal: 2680, calories: { kcal: 2400, stepGoal: 8000 }, steps: null });
    await completeCheckIn(db(), "2026-12-14", { waist: null, choice: "steps", rest: [] }, new Date("2026-12-20T23:30:00Z"));
    expect(JSON.parse((await row("2026-12-14")).outcome)).toEqual({ kind: "maintenance", newKcal: 2400, newStepGoal: 8000, pick: "calories", guardrail: null });
    expect((await targetsFor(db(), "2026-12-23")).kcal).toBe(2680);
    expect(await targetsFor(db(), "2026-12-28")).toEqual({ kcal: 2400, proteinG: 180, stepGoal: 8000 });
  });
});
