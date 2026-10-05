import { describe, expect, it } from "vitest";
import { meals } from "~/content";
import { checkIns, setLogs, workoutSessions } from "~/db/schema";
import { upsertSteps } from "~/server/body.server";
import { loadDay } from "~/server/day.server";
import { dayResults } from "~/server/history.server";
import { logOffPlan, logPlannedMeal } from "~/server/meals.server";
import { endSession } from "~/server/workouts.server";
import { chicago, db } from "./helpers";

async function onPlanDay(date: string) {
  await logOffPlan(db(), date, { name: "Protein day", category: "meal", kcal: 2000, proteinG: 185, relaxed: false }, new Date());
  await upsertSteps(db(), date, 8000, new Date());
}

describe("dayResults", () => {
  it("marks days on plan from protein, steps, and desserts", async () => {
    await onPlanDay("2026-10-06");
    await upsertSteps(db(), "2026-10-07", 9000, new Date());
    await onPlanDay("2026-10-08");
    await logOffPlan(db(), "2026-10-08", { name: "Cookies", category: "dessert", kcal: 400, proteinG: 4, relaxed: false }, new Date());
    const results = await dayResults(db(), "2026-10-06", "2026-10-08");
    expect(results.map((r) => [r.date, r.onPlan])).toEqual([
      ["2026-10-06", true],
      ["2026-10-07", false],
      ["2026-10-08", false],
    ]);
  });

  it("always counts relaxed days", async () => {
    const [r] = await dayResults(db(), "2026-11-26", "2026-11-26");
    expect(r.onPlan).toBe(true);
  });
});

describe("loadDay", () => {
  it("summarizes a training day morning", async () => {
    for (const d of ["2026-10-09", "2026-10-10", "2026-10-11"]) await onPlanDay(d);
    const lunchSlug = "chicken-and-rice-bowl";
    const day = await loadDay(db(), "2026-10-12", chicago("2026-10-12", "09:00"));
    expect(day.weekNumber).toBe(2);
    expect(day.mode).toBe("weekday");
    expect(day.training?.name).toBe("Chest, Back, Arms");
    expect(day.training?.exerciseCount).toBe(6);
    expect(day.training?.setCount).toBe(12);
    expect(day.slots).toHaveLength(5);
    expect(day.streak).toBe(3);
    expect(day.weighIn).toBeNull();
    expect(meals.has(lunchSlug)).toBe(true);
  });

  it("totals logged food and marks slots eaten", async () => {
    const day0 = await loadDay(db(), "2026-10-13", chicago("2026-10-13", "12:00"));
    const breakfast = day0.slots[0];
    await logPlannedMeal(db(), "2026-10-13", "breakfast", breakfast.meal, new Date());
    const day = await loadDay(db(), "2026-10-13", chicago("2026-10-13", "12:00"));
    expect(day.totals).toEqual({ kcal: breakfast.meal.kcal, proteinG: breakfast.meal.protein });
    expect(day.slots[0].logId).not.toBeNull();
    expect(day.nextSlot).toBe("lunch");
  });

  it("does not count training days before the phase starts as missed", async () => {
    const day = await loadDay(db(), "2026-10-06", chicago("2026-10-06", "10:00"));
    expect(day.missedTwice).toBe(false);
  });

  it("flags two missed training days in a row until a session happens", async () => {
    // Fri Oct 23 and Mon Oct 26 have no sets; Tue Oct 27 is today
    let day = await loadDay(db(), "2026-10-27", chicago("2026-10-27", "10:00"));
    expect(day.missedTwice).toBe(true);
    const [s] = await db().insert(workoutSessions).values({ date: "2026-10-27", templateId: "plan-b-home", startedAt: new Date().toISOString() }).returning();
    await db().insert(setLogs).values({ sessionId: s.id, exerciseId: "pull-up", position: 0, setNumber: 1, weightLb: 0, reps: 8, loggedAt: new Date().toISOString() });
    day = await loadDay(db(), "2026-10-27", chicago("2026-10-27", "18:00"));
    expect(day.missedTwice).toBe(false);
    expect(day.loggedSetToday).toBe(true);
  });

  it("reports the finished workout once the session is ended", async () => {
    const [s] = await db().insert(workoutSessions).values({ date: "2026-10-27", templateId: "plan-b-home", startedAt: new Date().toISOString() }).returning();
    await db().insert(setLogs).values({ sessionId: s.id, exerciseId: "pull-up", position: 0, setNumber: 1, weightLb: 0, reps: 8, loggedAt: new Date().toISOString() });
    expect((await loadDay(db(), "2026-10-27", chicago("2026-10-27", "13:00"))).finishedTemplateId).toBeNull();
    await endSession(db(), "2026-10-27", "plan-b-home", chicago("2026-10-27", "13:30"));
    expect((await loadDay(db(), "2026-10-27", chicago("2026-10-27", "14:00"))).finishedTemplateId).toBe("plan-b-home");
  });
});

describe("check-in on Today", () => {
  it("is due from Sunday 5pm, then skipped after Monday noon, and clears once done", async () => {
    expect((await loadDay(db(), "2026-10-25", chicago("2026-10-25", "16:30"))).checkInDue).toBe(false);
    expect((await loadDay(db(), "2026-10-25", chicago("2026-10-25", "17:30"))).checkInDue).toBe(true);
    const mondayMorning = await loadDay(db(), "2026-10-26", chicago("2026-10-26", "09:00"));
    expect([mondayMorning.checkInDue, mondayMorning.checkInSkipped]).toEqual([true, false]);
    const mondayAfternoon = await loadDay(db(), "2026-10-26", chicago("2026-10-26", "13:00"));
    expect([mondayAfternoon.checkInDue, mondayAfternoon.checkInSkipped]).toEqual([false, true]);
    await db().insert(checkIns).values({ weekStart: "2026-10-19", adherence: 6, outcome: "{}", completedAt: new Date().toISOString() });
    expect((await loadDay(db(), "2026-10-25", chicago("2026-10-25", "18:00"))).checkInDue).toBe(false);
    expect((await loadDay(db(), "2026-10-26", chicago("2026-10-26", "13:00"))).checkInSkipped).toBe(false);
  });
});
